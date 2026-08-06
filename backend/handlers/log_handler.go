package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/oc-navigation/backend/database"
	"github.com/oc-navigation/backend/models"
)

// truncRunes は文字（rune）単位で安全に切り詰める（UTF-8 の途中で切らない）。
func truncRunes(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}
	return s
}

// CreateLog はユーザーアプリからの行動ログ（ボタン押下など）を1件記録する（公開）。
// 全画面（WS未接続のホーム等も含む）から呼べるよう REST で受ける。
func CreateLog(c *gin.Context) {
	var body struct {
		DeviceID   string `json:"device_id"`
		Action     string `json:"action"`
		Label      string `json:"label"`
		Screen     string `json:"screen"`
		OriginNode string `json:"origin_node"`
		DestNode   string `json:"dest_node"`
		FromNode   string `json:"from_node"`
		ToNode     string `json:"to_node"`
		Step       int    `json:"step"`
		TotalSteps int    `json:"total_steps"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.DeviceID == "" || body.Action == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_id と action は必須です"})
		return
	}
	log := models.UserLog{
		DeviceID:   body.DeviceID,
		Action:     body.Action,
		Label:      truncRunes(body.Label, 200),
		Screen:     truncRunes(body.Screen, 200),
		OriginNode: body.OriginNode,
		DestNode:   body.DestNode,
		FromNode:   body.FromNode,
		ToNode:     body.ToNode,
		Step:       body.Step,
		TotalSteps: body.TotalSteps,
	}
	if err := database.DB.Create(&log).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, log)
}

func ListLogs(c *gin.Context) {
	var logs []models.UserLog
	q := database.DB.Order("created_at desc")
	if deviceID := c.Query("device_id"); deviceID != "" {
		q = q.Where("device_id = ?", deviceID)
	}
	if err := q.Find(&logs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, logs)
}
