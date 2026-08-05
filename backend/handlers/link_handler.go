package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/oc-navigation/backend/database"
	"github.com/oc-navigation/backend/models"
	"gorm.io/gorm"
)

func photosOrdered(db *gorm.DB) *gorm.DB {
	return db.Order("sort_order asc")
}

func arrivalPhotosOrdered(db *gorm.DB) *gorm.DB {
	return db.Order("sort_order asc")
}

// ListLinks は経路ネットワークのリンク一覧を返す。取得元は Network（インターフェース）経由。
func ListLinks(c *gin.Context) {
	links, err := Network.Links()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, links)
}

func GetLink(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var link models.Link
	if err := database.DB.Preload("Photos", photosOrdered).
		Preload("ArrivalPhotos", arrivalPhotosOrdered).
		Preload("FromNode").Preload("ToNode").
		First(&link, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "link not found"})
		return
	}
	c.JSON(http.StatusOK, link)
}

func CreateLink(c *gin.Context) {
	var link models.Link
	if err := c.ShouldBindJSON(&link); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := database.DB.Create(&link).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	database.DB.Preload("FromNode").Preload("ToNode").First(&link, link.ID)
	c.JSON(http.StatusCreated, link)
}

func UpdateLink(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var link models.Link
	if err := database.DB.First(&link, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "link not found"})
		return
	}
	if err := c.ShouldBindJSON(&link); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	database.DB.Save(&link)
	database.DB.Preload("FromNode").Preload("ToNode").First(&link, link.ID)
	c.JSON(http.StatusOK, link)
}

func DeleteLink(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	database.DB.Delete(&models.Link{}, id)
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
