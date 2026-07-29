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

// GetActiveAnnouncement は現在有効なお知らせ（POP）を返す（公開）。
// 有効なものが無ければ 204 No Content。ユーザーアプリが起動時に取得する。
func GetActiveAnnouncement(c *gin.Context) {
	var a models.Announcement
	if err := database.DB.Where("is_active = ?", true).Order("updated_at desc").First(&a).Error; err != nil {
		c.Status(http.StatusNoContent)
		return
	}
	c.JSON(http.StatusOK, a)
}

// ListAnnouncements は全お知らせを新しい順に返す（管理者）。
func ListAnnouncements(c *gin.Context) {
	var list []models.Announcement
	database.DB.Order("created_at desc").Find(&list)
	c.JSON(http.StatusOK, list)
}

// CreateAnnouncement は POP 画像をアップロードしてお知らせを登録する（管理者）。
// multipart/form-data: image（必須）, title, body, link_url, is_active("true"で有効化)
func CreateAnnouncement(c *gin.Context) {
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
	filename := fmt.Sprintf("announce_%d%s", time.Now().UnixNano(), ext)
	if err := os.WriteFile(filepath.Join(uploadDir, filename), data, 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save file"})
		return
	}

	a := models.Announcement{
		Title:    c.PostForm("title"),
		Body:     c.PostForm("body"),
		LinkURL:  c.PostForm("link_url"),
		ImageURL: "/uploads/" + filename,
		IsActive: c.PostForm("is_active") == "true",
	}
	// 有効にする場合は他を無効化（同時に有効なのは1件）
	if a.IsActive {
		database.DB.Model(&models.Announcement{}).Where("is_active = ?", true).Update("is_active", false)
	}
	database.DB.Create(&a)
	c.JSON(http.StatusCreated, a)
}

// ActivateAnnouncement は指定のお知らせを有効化し、他を無効化する（管理者）。
func ActivateAnnouncement(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var a models.Announcement
	if err := database.DB.First(&a, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	database.DB.Model(&models.Announcement{}).Where("is_active = ?", true).Update("is_active", false)
	database.DB.Model(&a).Update("is_active", true)
	database.DB.First(&a, id)
	c.JSON(http.StatusOK, a)
}

// DeactivateAnnouncement は指定のお知らせを無効化する（管理者）。POP を非表示にできる。
func DeactivateAnnouncement(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var a models.Announcement
	if err := database.DB.First(&a, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	database.DB.Model(&a).Update("is_active", false)
	database.DB.First(&a, id)
	c.JSON(http.StatusOK, a)
}

// DeleteAnnouncement はお知らせと画像ファイルを削除する（管理者）。
func DeleteAnnouncement(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var a models.Announcement
	if err := database.DB.First(&a, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "./uploads"
	}
	_ = os.Remove(filepath.Join(uploadDir, filepath.Base(a.ImageURL)))
	database.DB.Delete(&a)
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
