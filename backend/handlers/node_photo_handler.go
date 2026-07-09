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

// ListNodePhotos は指定ノードの写真一覧を返す（新しい順）。ユーザーアプリ公開。
func ListNodePhotos(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid node id"})
		return
	}
	var photos []models.NodePhoto
	database.DB.Where("node_id = ?", id).Order("created_at desc").Order("id desc").Find(&photos)
	c.JSON(http.StatusOK, photos)
}

// UploadNodePhoto はノードに写真を1枚登録する。ゴールカードで到着者が使うため公開エンドポイント。
func UploadNodePhoto(c *gin.Context) {
	nodeIDStr := c.PostForm("node_id")
	nodeID, err := strconv.Atoi(nodeIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid node_id"})
		return
	}

	// 登録先ノードの存在確認（不正な node_id への孤児レコードを防ぐ）
	var node models.Node
	if err := database.DB.First(&node, nodeID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "node not found"})
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
	filename := fmt.Sprintf("node_%d_%d%s", nodeID, time.Now().UnixNano(), ext)
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

	photo := models.NodePhoto{
		NodeID:  uint(nodeID),
		URL:     "/uploads/" + filename,
		Caption: c.PostForm("caption"),
	}
	database.DB.Create(&photo)
	c.JSON(http.StatusCreated, photo)
}

// DeleteNodePhoto はノード写真を1枚削除する（画像ファイルも消す）。公開エンドポイント。
func DeleteNodePhoto(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var photo models.NodePhoto
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
