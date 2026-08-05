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

func UploadPhoto(c *gin.Context) {
	linkIDStr := c.PostForm("link_id")
	linkID, err := strconv.Atoi(linkIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid link_id"})
		return
	}

	file, header, err := c.Request.FormFile("photo")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no photo file"})
		return
	}
	defer file.Close()

	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "./uploads"
	}
	_ = os.MkdirAll(uploadDir, 0755)

	ext := filepath.Ext(header.Filename)
	filename := fmt.Sprintf("%d_%d%s", linkID, time.Now().UnixNano(), ext)
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

	sortOrderStr := c.PostForm("sort_order")
	sortOrder, _ := strconv.Atoi(sortOrderStr)

	photo := models.Photo{
		LinkID:    uint(linkID),
		URL:       "/uploads/" + filename,
		Caption:   c.PostForm("caption"),
		SortOrder: sortOrder,
	}
	database.DB.Create(&photo)
	c.JSON(http.StatusCreated, photo)
}

// ReplacePhoto は既存の道中写真の画像を差し替える（合成結果の上書き保存に使う。管理者のみ）。
// multipart/form-data: photo（必須）。レコード（link_id, sort_order, caption）は保持し、URL だけ更新。
func ReplacePhoto(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var photo models.Photo
	if err := database.DB.First(&photo, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "photo not found"})
		return
	}

	file, header, err := c.Request.FormFile("photo")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no photo file"})
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
	filename := fmt.Sprintf("%d_%d%s", photo.LinkID, time.Now().UnixNano(), ext)
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

	oldURL := photo.URL
	photo.URL = "/uploads/" + filename
	if err := database.DB.Save(&photo).Error; err != nil {
		_ = os.Remove(dst)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if oldURL != "" && oldURL != photo.URL {
		_ = os.Remove(filepath.Join(uploadDir, filepath.Base(oldURL)))
	}
	c.JSON(http.StatusOK, photo)
}

func DeletePhoto(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var photo models.Photo
	if err := database.DB.First(&photo, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "photo not found"})
		return
	}
	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "./uploads"
	}
	_ = os.Remove(filepath.Join(uploadDir, filepath.Base(photo.URL)))
	database.DB.Delete(&photo)
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func ReorderPhotos(c *gin.Context) {
	var body struct {
		Orders []struct {
			ID    uint `json:"id"`
			Order int  `json:"order"`
		} `json:"orders"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	for _, o := range body.Orders {
		database.DB.Model(&models.Photo{}).Where("id = ?", o.ID).Update("sort_order", o.Order)
	}
	c.JSON(http.StatusOK, gin.H{"message": "reordered"})
}
