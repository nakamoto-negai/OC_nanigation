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

// ListArrivalPhotos は指定リンクの到着地点写真一覧を返す（sort_order 昇順）。ユーザーアプリ公開。
func ListArrivalPhotos(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid link id"})
		return
	}
	var photos []models.ArrivalPhoto
	database.DB.Where("link_id = ?", id).Order("sort_order asc").Order("id asc").Find(&photos)
	c.JSON(http.StatusOK, photos)
}

// UploadArrivalPhoto はリンクに到着地点写真を1枚登録する（管理者のみ）。
func UploadArrivalPhoto(c *gin.Context) {
	linkID, err := strconv.Atoi(c.PostForm("link_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid link_id"})
		return
	}

	// 登録先リンクの存在確認（不正な link_id への孤児レコードを防ぐ）
	var link models.Link
	if err := database.DB.First(&link, linkID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "link not found"})
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
	filename := fmt.Sprintf("arrival_%d_%d%s", linkID, time.Now().UnixNano(), ext)
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

	sortOrder, _ := strconv.Atoi(c.PostForm("sort_order"))
	photo := models.ArrivalPhoto{
		LinkID:    uint(linkID),
		URL:       "/uploads/" + filename,
		Caption:   c.PostForm("caption"),
		SortOrder: sortOrder,
	}
	if err := database.DB.Create(&photo).Error; err != nil {
		// 保存に失敗したら書き込んだ画像ファイルは残さない
		_ = os.Remove(dst)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, photo)
}

// ReplaceArrivalPhoto は既存の到着地点写真の画像を差し替える（合成結果の上書き保存に使う。管理者のみ）。
// multipart/form-data: photo（必須）。レコードは同じまま URL だけ新ファイルに更新し、旧ファイルを消す。
func ReplaceArrivalPhoto(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var photo models.ArrivalPhoto
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
		ext = ".png"
	}
	filename := fmt.Sprintf("arrival_%d_%d%s", photo.LinkID, time.Now().UnixNano(), ext)
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
	// 保存成功後に旧ファイルを削除する
	if oldURL != "" && oldURL != photo.URL {
		_ = os.Remove(filepath.Join(uploadDir, filepath.Base(oldURL)))
	}
	c.JSON(http.StatusOK, photo)
}

// DeleteArrivalPhoto は到着地点写真を1枚削除する（画像ファイルも消す。管理者のみ）。
func DeleteArrivalPhoto(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var photo models.ArrivalPhoto
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
