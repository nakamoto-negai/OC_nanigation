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

// ListDemoOverlays は登録済みデモ用重ね画像を新しい順に返す（管理者のみ）。
func ListDemoOverlays(c *gin.Context) {
	var list []models.DemoOverlay
	database.DB.Order("created_at desc").Find(&list)
	c.JSON(http.StatusOK, list)
}

// UploadDemoOverlay はデモ用の重ね画像をアップロードして登録する（管理者のみ）。
// multipart/form-data: image（必須）, name（任意）
func UploadDemoOverlay(c *gin.Context) {
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
	filename := fmt.Sprintf("demo_%d%s", time.Now().UnixNano(), ext)
	if err := os.WriteFile(filepath.Join(uploadDir, filename), data, 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save file"})
		return
	}

	ov := models.DemoOverlay{
		Name:     c.PostForm("name"),
		ImageURL: "/uploads/" + filename,
	}
	database.DB.Create(&ov)
	c.JSON(http.StatusCreated, ov)
}

// DeleteDemoOverlay は登録画像とファイルを削除する（管理者のみ）。
func DeleteDemoOverlay(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var ov models.DemoOverlay
	if err := database.DB.First(&ov, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "./uploads"
	}
	_ = os.Remove(filepath.Join(uploadDir, filepath.Base(ov.ImageURL)))
	database.DB.Delete(&ov)
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
