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

func ListIndoorTransitions(c *gin.Context) {
	var list []models.IndoorTransition
	database.DB.Order("id asc").Find(&list)
	c.JSON(http.StatusOK, list)
}

// saveIndoorImage はアップロードされた画像（任意）を保存し URL を返す。画像が無ければ空文字。
func saveIndoorImage(c *gin.Context) (string, error) {
	file, header, err := c.Request.FormFile("image")
	if err != nil {
		return "", nil // 画像なしは許容
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		return "", err
	}
	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "./uploads"
	}
	_ = os.MkdirAll(uploadDir, 0755)

	ext := filepath.Ext(header.Filename)
	if ext == "" {
		ext = ".jpg"
	}
	filename := fmt.Sprintf("indoor_%d%s", time.Now().UnixNano(), ext)
	if err := os.WriteFile(filepath.Join(uploadDir, filename), data, 0644); err != nil {
		return "", err
	}
	return "/uploads/" + filename, nil
}

func removeIndoorImage(url string) {
	if url == "" {
		return
	}
	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "./uploads"
	}
	_ = os.Remove(filepath.Join(uploadDir, filepath.Base(url)))
}

// CreateIndoorTransition は屋内案内のリンクペアを作成する。
// multipart/form-data: link_a_id, link_b_id（必須）, image（任意）
func CreateIndoorTransition(c *gin.Context) {
	linkAID, _ := strconv.Atoi(c.PostForm("link_a_id"))
	linkBID, _ := strconv.Atoi(c.PostForm("link_b_id"))
	if linkAID <= 0 || linkBID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "link_a_id と link_b_id は必須です"})
		return
	}
	if linkAID == linkBID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "同じリンクはペアにできません"})
		return
	}

	imageURL, err := saveIndoorImage(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "画像の保存に失敗しました"})
		return
	}

	it := models.IndoorTransition{
		LinkAID:  uint(linkAID),
		LinkBID:  uint(linkBID),
		ImageURL: imageURL,
	}
	if err := database.DB.Create(&it).Error; err != nil {
		removeIndoorImage(imageURL)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, it)
}

// UpdateIndoorTransition は屋内案内ペアの画像を差し替える（合成結果の上書きにも使う）。
// multipart/form-data: image（画像未指定なら既存を維持）
func UpdateIndoorTransition(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var it models.IndoorTransition
	if err := database.DB.First(&it, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	imageURL, err := saveIndoorImage(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "画像の保存に失敗しました"})
		return
	}
	if imageURL != "" {
		removeIndoorImage(it.ImageURL) // 旧画像を削除して差し替え
		it.ImageURL = imageURL
	}

	database.DB.Save(&it)
	c.JSON(http.StatusOK, it)
}

func DeleteIndoorTransition(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var it models.IndoorTransition
	if err := database.DB.First(&it, id).Error; err == nil {
		removeIndoorImage(it.ImageURL)
	}
	database.DB.Delete(&models.IndoorTransition{}, id)
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
