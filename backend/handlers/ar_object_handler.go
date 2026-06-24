package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/oc-navigation/backend/database"
	"github.com/oc-navigation/backend/models"
)

// ListARObjects は登録済みの AR 物体（詳細情報）一覧を返す。
func ListARObjects(c *gin.Context) {
	var objs []models.ARObject
	database.DB.Order("created_at desc").Find(&objs)
	c.JSON(http.StatusOK, objs)
}

// CreateARObject は新しい AR 物体を作成する。
func CreateARObject(c *gin.Context) {
	var obj models.ARObject
	if err := c.ShouldBindJSON(&obj); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if obj.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}
	database.DB.Create(&obj)
	c.JSON(http.StatusCreated, obj)
}

// UpdateARObject は AR 物体を更新する。
func UpdateARObject(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var obj models.ARObject
	if err := database.DB.First(&obj, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var in models.ARObject
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	obj.Name = in.Name
	obj.Description = in.Description
	obj.Category = in.Category
	obj.ImageURL = in.ImageURL
	obj.LinkURL = in.LinkURL
	database.DB.Save(&obj)
	c.JSON(http.StatusOK, obj)
}

// DeleteARObject は AR 物体を削除する。紐づく ARFeature の参照は null に戻す。
func DeleteARObject(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var obj models.ARObject
	if err := database.DB.First(&obj, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	database.DB.Model(&models.ARFeature{}).Where("ar_object_id = ?", id).Update("ar_object_id", nil)
	database.DB.Delete(&obj)
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
