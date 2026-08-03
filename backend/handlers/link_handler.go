package handlers

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

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

func ListLinks(c *gin.Context) {
	var links []models.Link
	database.DB.Preload("Photos", photosOrdered).
		Preload("ArrivalPhotos", arrivalPhotosOrdered).
		Preload("FromNode").Preload("ToNode").
		Find(&links)
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

// UploadLinkIndoorImage はリンクの屋内案内カード用画像をアップロード（差し替え）する（管理者のみ）。
// multipart/form-data: image（必須）。旧画像があれば削除し、URL を更新する。
func UploadLinkIndoorImage(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var link models.Link
	if err := database.DB.First(&link, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "link not found"})
		return
	}

	file, header, err := c.Request.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no image file"})
		return
	}
	defer file.Close()

	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "./uploads"
	}
	_ = os.MkdirAll(uploadDir, 0755)

	ext := filepath.Ext(header.Filename)
	if ext == "" {
		ext = ".jpg"
	}
	filename := fmt.Sprintf("indoor_%d_%d%s", link.ID, time.Now().UnixNano(), ext)
	dst := filepath.Join(uploadDir, filename)

	out, err := os.Create(dst)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save file"})
		return
	}
	defer out.Close()
	buf := make([]byte, 4*1024*1024)
	for {
		n, readErr := file.Read(buf)
		if n > 0 {
			out.Write(buf[:n])
		}
		if readErr != nil {
			break
		}
	}

	oldURL := link.IndoorImageURL
	link.IndoorImageURL = "/uploads/" + filename
	if err := database.DB.Save(&link).Error; err != nil {
		_ = os.Remove(dst)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if oldURL != "" && oldURL != link.IndoorImageURL {
		_ = os.Remove(filepath.Join(uploadDir, filepath.Base(oldURL)))
	}
	database.DB.Preload("FromNode").Preload("ToNode").First(&link, link.ID)
	c.JSON(http.StatusOK, link)
}

// DeleteLinkIndoorImage はリンクの屋内案内カード用画像を削除する（管理者のみ）。
func DeleteLinkIndoorImage(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var link models.Link
	if err := database.DB.First(&link, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "link not found"})
		return
	}
	if link.IndoorImageURL != "" {
		uploadDir := os.Getenv("UPLOAD_DIR")
		if uploadDir == "" {
			uploadDir = "./uploads"
		}
		_ = os.Remove(filepath.Join(uploadDir, filepath.Base(link.IndoorImageURL)))
		link.IndoorImageURL = ""
		database.DB.Save(&link)
	}
	database.DB.Preload("FromNode").Preload("ToNode").First(&link, link.ID)
	c.JSON(http.StatusOK, link)
}
