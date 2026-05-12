package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/oc-navigation/backend/ws"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func UserWS(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	client := &ws.Client{
		Hub:     ws.GlobalHub,
		Conn:    conn,
		Send:    make(chan []byte, 64),
		IsAdmin: false,
	}
	ws.GlobalHub.Register(client)
	go client.WritePump()
	client.ReadPump(ws.GlobalHub)
}

func AdminWS(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	client := &ws.Client{
		Hub:     ws.GlobalHub,
		Conn:    conn,
		Send:    make(chan []byte, 64),
		IsAdmin: true,
	}
	ws.GlobalHub.Register(client)
	go client.WritePump()
	client.ReadPump(ws.GlobalHub)
}
