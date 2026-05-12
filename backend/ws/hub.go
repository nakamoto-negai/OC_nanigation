package ws

import (
	"encoding/json"
	"log"
	"time"

	"github.com/gorilla/websocket"
	"github.com/oc-navigation/backend/database"
	"github.com/oc-navigation/backend/models"
)

type UserPosition struct {
	UserID     string    `json:"user_id"`
	Step       int       `json:"step"`
	TotalSteps int       `json:"total_steps"`
	FromNode   string    `json:"from_node"`
	ToNode     string    `json:"to_node"`
	FromNodeID int       `json:"from_node_id"`
	ToNodeID   int       `json:"to_node_id"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type IncomingMsg struct {
	Type       string `json:"type"`
	UserID     string `json:"user_id"`
	Step       int    `json:"step"`
	TotalSteps int    `json:"total_steps"`
	FromNode   string `json:"from_node"`
	ToNode     string `json:"to_node"`
	FromNodeID int    `json:"from_node_id"`
	ToNodeID   int    `json:"to_node_id"`
}

type Client struct {
	Hub     *Hub
	Conn    *websocket.Conn
	Send    chan []byte
	IsAdmin bool
	UserID  string
}

type Hub struct {
	clients        map[*Client]bool
	register       chan *Client
	unregister     chan *Client
	positionUpdate chan *UserPosition
	positions      map[string]*UserPosition
}

var GlobalHub = newHub()

func newHub() *Hub {
	return &Hub{
		clients:        make(map[*Client]bool),
		register:       make(chan *Client, 16),
		unregister:     make(chan *Client, 16),
		positionUpdate: make(chan *UserPosition, 64),
		positions:      make(map[string]*UserPosition),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.clients[client] = true
			if client.IsAdmin {
				h.sendAllPositions(client)
			}
		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.Send)
				if !client.IsAdmin && client.UserID != "" {
					delete(h.positions, client.UserID)
					h.broadcastPositions()
				}
			}
		case pos := <-h.positionUpdate:
			prev := h.positions[pos.UserID]
			h.positions[pos.UserID] = pos
			h.broadcastPositions()

			action := "step_change"
			if prev == nil {
				action = "nav_start"
			}
			go database.DB.Create(&models.UserLog{
				DeviceID:   pos.UserID,
				Action:     action,
				FromNode:   pos.FromNode,
				ToNode:     pos.ToNode,
				Step:       pos.Step,
				TotalSteps: pos.TotalSteps,
				CreatedAt:  time.Now(),
			})
		}
	}
}

func (h *Hub) Register(c *Client)             { h.register <- c }
func (h *Hub) Unregister(c *Client)           { h.unregister <- c }
func (h *Hub) UpdatePosition(p *UserPosition) { h.positionUpdate <- p }

func (h *Hub) sendAllPositions(c *Client) {
	positions := make([]*UserPosition, 0, len(h.positions))
	for _, p := range h.positions {
		positions = append(positions, p)
	}
	data, _ := json.Marshal(map[string]any{
		"type":      "all_positions",
		"positions": positions,
	})
	select {
	case c.Send <- data:
	default:
	}
}

func (h *Hub) broadcastPositions() {
	positions := make([]*UserPosition, 0, len(h.positions))
	for _, p := range h.positions {
		positions = append(positions, p)
	}
	data, _ := json.Marshal(map[string]any{
		"type":      "all_positions",
		"positions": positions,
	})
	for c := range h.clients {
		if !c.IsAdmin {
			continue
		}
		select {
		case c.Send <- data:
		default:
			close(c.Send)
			delete(h.clients, c)
		}
	}
}

func (c *Client) ReadPump(hub *Hub) {
	defer func() {
		hub.Unregister(c)
		c.Conn.Close()
	}()
	for {
		_, msg, err := c.Conn.ReadMessage()
		if err != nil {
			break
		}
		if c.IsAdmin {
			continue
		}
		var in IncomingMsg
		if err := json.Unmarshal(msg, &in); err != nil {
			continue
		}
		if in.Type == "position" {
			c.UserID = in.UserID
			hub.UpdatePosition(&UserPosition{
				UserID:     in.UserID,
				Step:       in.Step,
				TotalSteps: in.TotalSteps,
				FromNode:   in.FromNode,
				ToNode:     in.ToNode,
				FromNodeID: in.FromNodeID,
				ToNodeID:   in.ToNodeID,
				UpdatedAt:  time.Now(),
			})
		} else if in.Type == "reroute" {
			c.UserID = in.UserID
			go database.DB.Create(&models.UserLog{
				DeviceID:   in.UserID,
				Action:     "reroute",
				FromNode:   in.FromNode,
				ToNode:     in.ToNode,
				Step:       in.Step,
				TotalSteps: in.TotalSteps,
				CreatedAt:  time.Now(),
			})
		} else if in.Type == "goal_reached" {
			c.UserID = in.UserID
			go database.DB.Create(&models.UserLog{
				DeviceID:   in.UserID,
				Action:     "goal_reached",
				ToNode:     in.ToNode,
				TotalSteps: in.TotalSteps,
				CreatedAt:  time.Now(),
			})
		}
	}
}

func (c *Client) WritePump() {
	defer c.Conn.Close()
	for msg := range c.Send {
		if err := c.Conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			log.Println("ws write:", err)
			return
		}
	}
}
