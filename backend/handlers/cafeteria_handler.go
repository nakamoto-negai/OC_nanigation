package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/oc-navigation/backend/database"
	"github.com/oc-navigation/backend/models"
)

// ListCafeterias は食堂一覧を返す（並び順→ID順）。ユーザーアプリのヘッダー表示に使うため公開。
func ListCafeterias(c *gin.Context) {
	var list []models.Cafeteria
	database.DB.Order("sort_order asc, id asc").Find(&list)
	c.JSON(http.StatusOK, list)
}

// CreateCafeteria は食堂を追加する（管理者のみ）。
func CreateCafeteria(c *gin.Context) {
	var cafe models.Cafeteria
	if err := c.ShouldBindJSON(&cafe); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if cafe.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name は必須です"})
		return
	}
	if cafe.CongestionLevel < 0 || cafe.CongestionLevel > 4 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "混雑度は 0〜4 で指定してください"})
		return
	}
	if err := database.DB.Create(&cafe).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, cafe)
}

// UpdateCafeteria は食堂の名前・混雑度・並び順を更新する（管理者のみ）。
func UpdateCafeteria(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var cafe models.Cafeteria
	if err := database.DB.First(&cafe, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "cafeteria not found"})
		return
	}
	var body struct {
		Name            string `json:"name"`
		CongestionLevel int    `json:"congestion_level"`
		SortOrder       int    `json:"sort_order"`
		DestinationID   *uint  `json:"destination_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name は必須です"})
		return
	}
	if body.CongestionLevel < 0 || body.CongestionLevel > 4 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "混雑度は 0〜4 で指定してください"})
		return
	}
	cafe.Name = body.Name
	cafe.CongestionLevel = body.CongestionLevel
	cafe.SortOrder = body.SortOrder
	cafe.DestinationID = body.DestinationID
	database.DB.Save(&cafe)
	c.JSON(http.StatusOK, cafe)
}

// DeleteCafeteria は食堂を削除する（管理者のみ）。
func DeleteCafeteria(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	database.DB.Delete(&models.Cafeteria{}, id)
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

// UpdateCafeteriaCongestion は指定した食堂の混雑度だけを更新する限定エンドポイント。
// 食堂編集用アカウント（および管理者）が使う。名前などは変更しない。
func UpdateCafeteriaCongestion(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var cafe models.Cafeteria
	if err := database.DB.First(&cafe, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "cafeteria not found"})
		return
	}
	var body struct {
		CongestionLevel int `json:"congestion_level"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.CongestionLevel < 0 || body.CongestionLevel > 4 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "混雑度は 0〜4 で指定してください"})
		return
	}
	cafe.CongestionLevel = body.CongestionLevel
	database.DB.Save(&cafe)
	c.JSON(http.StatusOK, cafe)
}
