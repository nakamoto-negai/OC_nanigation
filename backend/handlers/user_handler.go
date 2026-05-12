package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/oc-navigation/backend/database"
	"github.com/oc-navigation/backend/models"
)

func RegisterUser(c *gin.Context) {
	var body struct {
		DeviceID string `json:"device_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user models.User
	result := database.DB.Where(models.User{DeviceID: body.DeviceID}).FirstOrCreate(&user)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	go database.DB.Create(&models.UserLog{
		DeviceID:  body.DeviceID,
		Action:    "app_open",
		CreatedAt: time.Now(),
	})

	c.JSON(http.StatusOK, user)
}

func ListUsers(c *gin.Context) {
	var users []models.User
	if err := database.DB.Order("created_at desc").Find(&users).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, users)
}
