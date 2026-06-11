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
		MapNorthOffset      float64 `json:"map_north_offset"`
		RerouteVisibility   bool    `json:"reroute_visibility"`
		RerouteIncident     bool    `json:"reroute_incident"`
		ReroteCongestion    bool    `json:"reroute_congestion"`
		RerouteOther        bool    `json:"reroute_other"`
		StampURL            string  `json:"stamp_url"`
		CafeteriaCongestion int     `json:"cafeteria_congestion"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var s models.Setting
	database.DB.FirstOrCreate(&s, models.Setting{ID: 1})
	s.MapNorthOffset = body.MapNorthOffset
	s.RerouteVisibility = body.RerouteVisibility
	s.RerouteIncident = body.RerouteIncident
	s.ReroteCongestion = body.ReroteCongestion
	s.RerouteOther = body.RerouteOther
	s.StampURL = body.StampURL
	s.CafeteriaCongestion = body.CafeteriaCongestion
	database.DB.Save(&s)
	c.JSON(http.StatusOK, s)
}
