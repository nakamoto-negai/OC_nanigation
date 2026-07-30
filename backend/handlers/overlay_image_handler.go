package handlers

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/oc-navigation/backend/database"
	"github.com/oc-navigation/backend/models"
)

// ListOverlayImages は登録済みの合成用写真を新しい順に返す（管理者のみ）。
func ListOverlayImages(c *gin.Context) {
	var list []models.OverlayImage
	database.DB.Order("created_at desc").Find(&list)
	c.JSON(http.StatusOK, list)
}

// UploadOverlayImage は合成用写真をアップロードして登録する（管理者のみ）。
// multipart/form-data: image（必須）, name（任意）
func UploadOverlayImage(c *gin.Context) {
	file, header, err := c.Request.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no image file"})
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read image"})
		return
	}

	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "./uploads"
	}
	_ = os.MkdirAll(uploadDir, 0755)

	ext := filepath.Ext(header.Filename)
	if ext == "" {
		ext = ".png"
	}
	filename := fmt.Sprintf("overlay_%d%s", time.Now().UnixNano(), ext)
	if err := os.WriteFile(filepath.Join(uploadDir, filename), data, 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save file"})
		return
	}

	ov := models.OverlayImage{
		Name: c.PostForm("name"),
		URL:  "/uploads/" + filename,
	}
	if err := database.DB.Create(&ov).Error; err != nil {
		_ = os.Remove(filepath.Join(uploadDir, filename))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, ov)
}

// DeleteOverlayImage は合成用写真とファイルを削除する（管理者のみ）。
func DeleteOverlayImage(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var ov models.OverlayImage
	if err := database.DB.First(&ov, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "./uploads"
	}
	_ = os.Remove(filepath.Join(uploadDir, filepath.Base(ov.URL)))
	database.DB.Delete(&ov)
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
