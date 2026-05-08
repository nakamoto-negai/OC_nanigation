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
)

func ListMapImages(c *gin.Context) {
	var images []models.MapImage
	database.DB.Order("created_at desc").Find(&images)
	c.JSON(http.StatusOK, images)
}

func GetActiveMapImage(c *gin.Context) {
	var img models.MapImage
	if err := database.DB.Where("is_active = ?", true).First(&img).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no active map image"})
		return
	}
	c.JSON(http.StatusOK, img)
}

func UploadMapImage(c *gin.Context) {
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
	filename := fmt.Sprintf("map_%d%s", time.Now().UnixNano(), ext)
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

	name := c.PostForm("name")
	if name == "" {
		name = header.Filename
	}
	width, _ := strconv.Atoi(c.PostForm("width"))
	height, _ := strconv.Atoi(c.PostForm("height"))

	img := models.MapImage{
		Name:   name,
		URL:    "/uploads/" + filename,
		Width:  width,
		Height: height,
	}
	database.DB.Create(&img)
	c.JSON(http.StatusCreated, img)
}

func ActivateMapImage(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	database.DB.Model(&models.MapImage{}).Where("is_active = ?", true).Update("is_active", false)
	var img models.MapImage
	if err := database.DB.First(&img, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	img.IsActive = true
	database.DB.Save(&img)
	c.JSON(http.StatusOK, img)
}

func DeleteMapImage(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var img models.MapImage
	if err := database.DB.First(&img, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "./uploads"
	}
	_ = os.Remove(filepath.Join(uploadDir, filepath.Base(img.URL)))
	database.DB.Delete(&img)
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
