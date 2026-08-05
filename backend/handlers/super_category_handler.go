package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/oc-navigation/backend/database"
	"github.com/oc-navigation/backend/models"
)

// ListSuperCategories は大カテゴリー一覧を並び順で返す（公開）。
func ListSuperCategories(c *gin.Context) {
	var list []models.SuperCategory
	database.DB.Order("sort_order asc, id asc").Find(&list)
	c.JSON(http.StatusOK, list)
}

func CreateSuperCategory(c *gin.Context) {
	var sc models.SuperCategory
	if err := c.ShouldBindJSON(&sc); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := database.DB.Create(&sc).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, sc)
}

func UpdateSuperCategory(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var sc models.SuperCategory
	if err := database.DB.First(&sc, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "super category not found"})
		return
	}
	if err := c.ShouldBindJSON(&sc); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	database.DB.Save(&sc)
	c.JSON(http.StatusOK, sc)
}

// DeleteSuperCategory は大カテゴリーを削除し、属していたカテゴリーの super_category_id を NULL に戻す。
func DeleteSuperCategory(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	database.DB.Model(&models.Category{}).Where("super_category_id = ?", id).Update("super_category_id", nil)
	database.DB.Delete(&models.SuperCategory{}, id)
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
