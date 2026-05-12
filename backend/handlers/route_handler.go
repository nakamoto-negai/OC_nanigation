package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/oc-navigation/backend/algorithms"
	"github.com/oc-navigation/backend/database"
	"github.com/oc-navigation/backend/models"
	"gorm.io/gorm"
)

type RouteRequest struct {
	StartID        uint   `json:"start_id" binding:"required"`
	GoalID         uint   `json:"goal_id" binding:"required"`
	BlockedLinkIDs []uint `json:"blocked_link_ids"`
}

type RouteStepDetail struct {
	StepNumber int          `json:"step_number"`
	Link       models.Link  `json:"link"`
	FromNode   models.Node  `json:"from_node"`
	ToNode     models.Node  `json:"to_node"`
}

type RouteResponse struct {
	NodePath []models.Node     `json:"node_path"`
	Steps    []RouteStepDetail `json:"steps"`
	Total    float64           `json:"total_distance"`
}

func CalcRoute(c *gin.Context) {
	var req RouteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var links []models.Link
	database.DB.Find(&links)

	result := algorithms.Dijkstra(links, req.StartID, req.GoalID, req.BlockedLinkIDs)
	if result == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "迂回路が見つかりません"})
		return
	}

	nodeMap := make(map[uint]models.Node)
	var allNodes []models.Node
	database.DB.Find(&allNodes)
	for _, n := range allNodes {
		nodeMap[n.ID] = n
	}

	linkMap := make(map[uint]models.Link)
	var allLinks []models.Link
	database.DB.Preload("Photos", func(db *gorm.DB) *gorm.DB {
		return db.Order("sort_order asc")
	}).Find(&allLinks)
	for _, l := range allLinks {
		linkMap[l.ID] = l
	}

	var nodePath []models.Node
	for _, nid := range result.NodePath {
		if n, ok := nodeMap[nid]; ok {
			nodePath = append(nodePath, n)
		}
	}

	var steps []RouteStepDetail
	for i, s := range result.Steps {
		link := linkMap[s.LinkID]
		steps = append(steps, RouteStepDetail{
			StepNumber: i + 1,
			Link:       link,
			FromNode:   nodeMap[s.FromID],
			ToNode:     nodeMap[s.ToID],
		})
	}

	c.JSON(http.StatusOK, RouteResponse{
		NodePath: nodePath,
		Steps:    steps,
		Total:    result.Total,
	})
}
