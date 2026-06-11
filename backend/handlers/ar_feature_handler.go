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

// ListARFeatures は登録済みの AR 参照フレーム一覧を返す。
// 一覧では記述子（巨大になりがち）は省き、軽量に保つ。
func ListARFeatures(c *gin.Context) {
	var features []models.ARFeature
	database.DB.
		Preload("Node").
		Preload("ViewpointNode").
		Omit("Descriptors").
		Order("created_at desc").
		Find(&features)
	c.JSON(http.StatusOK, features)
}

// ListARFeaturesForMatch は記述子を含めた全データを返す。
// クライアント側（OpenCV.js）の特徴点マッチングで参照として読み込むために使う。
// ?viewpoint_node_id=N を付けると、その地点（現在地ノード）から見える建物だけに絞り込む。
func ListARFeaturesForMatch(c *gin.Context) {
	q := database.DB.Preload("Node").Preload("ViewpointNode").Order("created_at desc")
	if vp := c.Query("viewpoint_node_id"); vp != "" {
		if v, err := strconv.Atoi(vp); err == nil && v > 0 {
			q = q.Where("viewpoint_node_id = ?", v)
		}
	}
	var features []models.ARFeature
	q.Find(&features)
	c.JSON(http.StatusOK, features)
}

// CreateARFeature は管理画面のカメラで抽出した特徴点と参照画像を登録する。
// multipart/form-data:
//   image       : 参照フレームのサムネイル画像（必須）
//   name        : 表示名
//   node_id     : 紐づけるノード（任意）
//   width/height: 特徴点座標の基準となる画像サイズ
//   keypoints   : キーポイントの JSON 文字列
//   descriptors : ORB 記述子の base64 文字列
//   desc_rows/desc_cols: 記述子行列の形状
func CreateARFeature(c *gin.Context) {
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
	filename := fmt.Sprintf("arfeat_%d%s", time.Now().UnixNano(), ext)
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

	feat := models.ARFeature{
		Name:          c.PostForm("name"),
		ImageURL:      "/uploads/" + filename,
		Keypoints:     c.PostForm("keypoints"),
		Descriptors:   c.PostForm("descriptors"),
		KeypointCount: atoiOr(c.PostForm("keypoint_count"), 0),
		Width:         atoiOr(c.PostForm("width"), 0),
		Height:        atoiOr(c.PostForm("height"), 0),
		DescRows:      atoiOr(c.PostForm("desc_rows"), 0),
		DescCols:      atoiOr(c.PostForm("desc_cols"), 0),
	}
	if nid := c.PostForm("node_id"); nid != "" {
		if v, err := strconv.Atoi(nid); err == nil && v > 0 {
			u := uint(v)
			feat.NodeID = &u
		}
	}
	if vid := c.PostForm("viewpoint_node_id"); vid != "" {
		if v, err := strconv.Atoi(vid); err == nil && v > 0 {
			u := uint(v)
			feat.ViewpointNodeID = &u
		}
	}

	database.DB.Create(&feat)
	database.DB.Preload("Node").Preload("ViewpointNode").First(&feat, feat.ID)
	c.JSON(http.StatusCreated, feat)
}

func DeleteARFeature(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var feat models.ARFeature
	if err := database.DB.First(&feat, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "./uploads"
	}
	_ = os.Remove(filepath.Join(uploadDir, filepath.Base(feat.ImageURL)))
	database.DB.Delete(&feat)
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func atoiOr(s string, fallback int) int {
	if v, err := strconv.Atoi(s); err == nil {
		return v
	}
	return fallback
}
