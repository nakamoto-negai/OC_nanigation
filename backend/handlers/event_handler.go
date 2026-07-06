package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/oc-navigation/backend/database"
	"github.com/oc-navigation/backend/models"
)

// ListEvents はイベント一覧を返す。?node_id=N でそのノードのイベントだけに絞り込む。
func ListEvents(c *gin.Context) {
	q := database.DB.Order("sort_order asc").Order("id asc")
	if nid := c.Query("node_id"); nid != "" {
		if v, err := strconv.Atoi(nid); err == nil && v > 0 {
			q = q.Where("node_id = ?", v)
		}
	}
	var events []models.Event
	q.Find(&events)
	c.JSON(http.StatusOK, events)
}

func CreateEvent(c *gin.Context) {
	var event models.Event
	if err := c.ShouldBindJSON(&event); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if event.NodeID == 0 || event.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "node_id と name は必須です"})
		return
	}
	if err := database.DB.Create(&event).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, event)
}

func UpdateEvent(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var event models.Event
	if err := database.DB.First(&event, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		return
	}
	if err := c.ShouldBindJSON(&event); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	database.DB.Save(&event)
	c.JSON(http.StatusOK, event)
}

func DeleteEvent(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	database.DB.Delete(&models.Event{}, id)
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
