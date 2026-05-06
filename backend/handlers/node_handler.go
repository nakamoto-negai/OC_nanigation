package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/oc-navigation/backend/database"
	"github.com/oc-navigation/backend/models"
)

func ListNodes(c *gin.Context) {
	var nodes []models.Node
	database.DB.Find(&nodes)
	c.JSON(http.StatusOK, nodes)
}

func GetNode(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var node models.Node
	if err := database.DB.First(&node, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "node not found"})
		return
	}
	c.JSON(http.StatusOK, node)
}

func CreateNode(c *gin.Context) {
	var node models.Node
	if err := c.ShouldBindJSON(&node); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := database.DB.Create(&node).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, node)
}

func UpdateNode(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var node models.Node
	if err := database.DB.First(&node, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "node not found"})
		return
	}
	if err := c.ShouldBindJSON(&node); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	database.DB.Save(&node)
	c.JSON(http.StatusOK, node)
}

func DeleteNode(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	database.DB.Delete(&models.Node{}, id)
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
