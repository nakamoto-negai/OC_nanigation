package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/oc-navigation/backend/database"
	"github.com/oc-navigation/backend/models"
)

func GetSettings(c *gin.Context) {
	var s models.Setting
	database.DB.FirstOrCreate(&s, models.Setting{ID: 1})
	c.JSON(http.StatusOK, s)
}

func UpdateSettings(c *gin.Context) {
	var body struct {
		MapNorthOffset float64 `json:"map_north_offset"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var s models.Setting
	database.DB.FirstOrCreate(&s, models.Setting{ID: 1})
	s.MapNorthOffset = body.MapNorthOffset
	database.DB.Save(&s)
	c.JSON(http.StatusOK, s)
}
