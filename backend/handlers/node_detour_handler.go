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

func ListNodeDetours(c *gin.Context) {
	var detours []models.NodeDetour
	database.DB.Preload("Node").Preload("DetourNode").Find(&detours)
	c.JSON(http.StatusOK, detours)
}

// saveDetourImage はアップロードされた画像（任意）を保存し、URL を返す。
// 画像が無ければ空文字を返す。
func saveDetourImage(c *gin.Context) (string, error) {
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
	filename := fmt.Sprintf("detour_%d%s", time.Now().UnixNano(), ext)
	if err := os.WriteFile(filepath.Join(uploadDir, filename), data, 0644); err != nil {
		return "", err
	}
	return "/uploads/" + filename, nil
}

func removeDetourImage(url string) {
	if url == "" {
		return
	}
	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "./uploads"
	}
	_ = os.Remove(filepath.Join(uploadDir, filepath.Base(url)))
}

// CreateNodeDetour は寄り道ペアを作成する。
// multipart/form-data: node_id, detour_node_id（必須）, description, image（任意）
func CreateNodeDetour(c *gin.Context) {
	nodeID, _ := strconv.Atoi(c.PostForm("node_id"))
	detourNodeID, _ := strconv.Atoi(c.PostForm("detour_node_id"))
	if nodeID <= 0 || detourNodeID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "node_id と detour_node_id は必須です"})
		return
	}
	if nodeID == detourNodeID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "同じノードはペアにできません"})
		return
	}

	imageURL, err := saveDetourImage(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "画像の保存に失敗しました"})
		return
	}

	detour := models.NodeDetour{
		NodeID:       uint(nodeID),
		DetourNodeID: uint(detourNodeID),
		Description:  c.PostForm("description"),
		ImageURL:     imageURL,
	}
	if err := database.DB.Create(&detour).Error; err != nil {
		removeDetourImage(imageURL)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	database.DB.Preload("Node").Preload("DetourNode").First(&detour, detour.ID)
	c.JSON(http.StatusCreated, detour)
}

// UpdateNodeDetour は寄り道ペアの説明文・画像を更新する。
// multipart/form-data: description, image（任意。画像未指定なら既存を維持）
func UpdateNodeDetour(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var detour models.NodeDetour
	if err := database.DB.First(&detour, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	detour.Description = c.PostForm("description")

	imageURL, err := saveDetourImage(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "画像の保存に失敗しました"})
		return
	}
	if imageURL != "" {
		removeDetourImage(detour.ImageURL) // 旧画像を削除して差し替え
		detour.ImageURL = imageURL
	}

	database.DB.Save(&detour)
	database.DB.Preload("Node").Preload("DetourNode").First(&detour, detour.ID)
	c.JSON(http.StatusOK, detour)
}

func DeleteNodeDetour(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var detour models.NodeDetour
	if err := database.DB.First(&detour, id).Error; err == nil {
		removeDetourImage(detour.ImageURL)
	}
	database.DB.Delete(&models.NodeDetour{}, id)
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
