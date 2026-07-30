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
		MapNorthOffset          float64 `json:"map_north_offset"`
		RerouteVisibility       bool    `json:"reroute_visibility"`
		RerouteIncident         bool    `json:"reroute_incident"`
		ReroteCongestion        bool    `json:"reroute_congestion"`
		RerouteOther            bool    `json:"reroute_other"`
		StampURL                string  `json:"stamp_url"`
		CafeteriaCongestion     int     `json:"cafeteria_congestion"`
		ShowCafeteriaCongestion bool    `json:"show_cafeteria_congestion"`
		ShowARButton            bool    `json:"show_ar_button"`
		SurveyURL               string  `json:"survey_url"`
		DefaultDestinationID    *uint   `json:"default_destination_id"`
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
	s.ShowCafeteriaCongestion = body.ShowCafeteriaCongestion
	s.ShowARButton = body.ShowARButton
	s.SurveyURL = body.SurveyURL
	s.DefaultDestinationID = body.DefaultDestinationID
	database.DB.Save(&s)
	c.JSON(http.StatusOK, s)
}

// UpdateCafeteriaCongestion は食堂の混雑度だけを更新する限定エンドポイント。
// 食堂編集用アカウント（および管理者）が使う。他の設定項目は変更しない。
func UpdateCafeteriaCongestion(c *gin.Context) {
	var body struct {
		CafeteriaCongestion int `json:"cafeteria_congestion"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.CafeteriaCongestion < 0 || body.CafeteriaCongestion > 3 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "混雑度は 0〜3 で指定してください"})
		return
	}
	var s models.Setting
	database.DB.FirstOrCreate(&s, models.Setting{ID: 1})
	s.CafeteriaCongestion = body.CafeteriaCongestion
	database.DB.Save(&s)
	c.JSON(http.StatusOK, gin.H{"cafeteria_congestion": s.CafeteriaCongestion})
}
