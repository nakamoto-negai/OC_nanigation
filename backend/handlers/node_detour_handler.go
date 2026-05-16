package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/oc-navigation/backend/database"
	"github.com/oc-navigation/backend/models"
)

func ListNodeDetours(c *gin.Context) {
	var detours []models.NodeDetour
	database.DB.Preload("Node").Preload("DetourNode").Find(&detours)
	c.JSON(http.StatusOK, detours)
}

func CreateNodeDetour(c *gin.Context) {
	var input struct {
		NodeID       uint `json:"node_id" binding:"required"`
		DetourNodeID uint `json:"detour_node_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if input.NodeID == input.DetourNodeID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "同じノードはペアにできません"})
		return
	}
	detour := models.NodeDetour{
		NodeID:       input.NodeID,
		DetourNodeID: input.DetourNodeID,
	}
	if err := database.DB.Create(&detour).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	database.DB.Preload("Node").Preload("DetourNode").First(&detour, detour.ID)
	c.JSON(http.StatusCreated, detour)
}

func DeleteNodeDetour(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	database.DB.Delete(&models.NodeDetour{}, id)
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
