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
	"github.com/oc-navigation/backend/vision"
)

// ListARFeatures は登録済みの AR 参照フレーム一覧を返す。
// 一覧では記述子（巨大になりがち）は省き、軽量に保つ。
func ListARFeatures(c *gin.Context) {
	var features []models.ARFeature
	database.DB.
		Preload("Node").
		Preload("ViewpointNode").
		Preload("ARObject").
		Omit("Descriptors").
		Order("created_at desc").
		Find(&features)
	c.JSON(http.StatusOK, features)
}

// ListARFeaturesForMatch は記述子を含めた全データを返す。
// クライアント側（OpenCV.js）の特徴点マッチングで参照として読み込むために使う。
// ?viewpoint_node_id=N を付けると、その地点（現在地ノード）から見える建物だけに絞り込む。
func ListARFeaturesForMatch(c *gin.Context) {
	q := database.DB.Preload("Node").Preload("ViewpointNode").Preload("ARObject").Order("created_at desc")
	if vp := c.Query("viewpoint_node_id"); vp != "" {
		if v, err := strconv.Atoi(vp); err == nil && v > 0 {
			q = q.Where("viewpoint_node_id = ?", v)
		}
	}
	var features []models.ARFeature
	q.Find(&features)
	c.JSON(http.StatusOK, features)
}

// CreateARFeature は管理画面でアップロードされた参照画像から、サーバー側（gocv）で
// ORB 特徴点・記述子を抽出して登録する。以前はフロント（OpenCV.js）が抽出した値を
// そのまま保存していたが、ブラウザ側のロード不安定さを避けるため抽出をサーバーへ移した。
//
// 1 つの物体を複数の角度・距離の画像から覚えさせられるよう、image は複数枚受け取れる。
// 各画像ごとに ORB を抽出し、同じ物体情報（name/node_id/viewpoint_node_id/ar_object_id）を
// 共有する ARFeature レコードを1枚につき1件作成する。認識側は複数参照を突き合わせるため、
// どれか1枚に一致すればその物体を認識できる（角度違いに強くなる）。
//
// multipart/form-data:
//   image        : 参照画像（1枚以上・必須。複数可）
//   name         : 表示名（全レコード共通）
//   node_id      : 紐づけるノード（任意）
//   ar_object_id : 紐づける物体（任意）
//   max_features : 検出する最大特徴点数（任意・既定 500）
func CreateARFeature(c *gin.Context) {
	form, err := c.MultipartForm()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid form"})
		return
	}
	files := form.File["image"]
	if len(files) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no image file"})
		return
	}

	maxFeatures := atoiOr(c.PostForm("max_features"), 500)
	name := c.PostForm("name")

	// 全レコード共通の紐づけ（一度だけパースして各レコードで共有する）
	var nodeID, viewpointID, objID *uint
	if nid := c.PostForm("node_id"); nid != "" {
		if v, err := strconv.Atoi(nid); err == nil && v > 0 {
			u := uint(v)
			nodeID = &u
		}
	}
	if vid := c.PostForm("viewpoint_node_id"); vid != "" {
		if v, err := strconv.Atoi(vid); err == nil && v > 0 {
			u := uint(v)
			viewpointID = &u
		}
	}
	if oid := c.PostForm("ar_object_id"); oid != "" {
		if v, err := strconv.Atoi(oid); err == nil && v > 0 {
			u := uint(v)
			objID = &u
		}
	}

	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "./uploads"
	}
	_ = os.MkdirAll(uploadDir, 0755)

	created := make([]models.ARFeature, 0, len(files))
	skipped := 0
	firstErr := ""

	for i, header := range files {
		f, err := header.Open()
		if err != nil {
			skipped++
			continue
		}
		imageData, err := io.ReadAll(f)
		f.Close()
		if err != nil {
			skipped++
			continue
		}

		// 画像ごとにサーバー側で ORB 抽出（認識側 opencv.js とバイナリ互換の記述子を生成）
		orb, err := vision.ExtractORB(imageData, maxFeatures)
		if err != nil {
			skipped++
			if firstErr == "" {
				firstErr = err.Error()
			}
			continue
		}
		if orb.KeypointCount == 0 {
			// 特徴点が出ない画像はスキップして次へ（他の画像で覚えられる）
			skipped++
			continue
		}

		ext := filepath.Ext(header.Filename)
		if ext == "" {
			ext = ".jpg"
		}
		// 同一リクエスト内で連続保存しても衝突しないよう、インデックスも付与する
		filename := fmt.Sprintf("arfeat_%d_%d%s", time.Now().UnixNano(), i, ext)
		dst := filepath.Join(uploadDir, filename)
		if err := os.WriteFile(dst, imageData, 0644); err != nil {
			skipped++
			if firstErr == "" {
				firstErr = "failed to save file"
			}
			continue
		}

		feat := models.ARFeature{
			Name:            name,
			ImageURL:        "/uploads/" + filename,
			Keypoints:       orb.KeypointsJSON,
			Descriptors:     orb.Descriptors,
			KeypointCount:   orb.KeypointCount,
			Width:           orb.Width,
			Height:          orb.Height,
			DescRows:        orb.DescRows,
			DescCols:        orb.DescCols,
			NodeID:          nodeID,
			ViewpointNodeID: viewpointID,
			ARObjectID:      objID,
		}
		database.DB.Create(&feat)
		database.DB.Preload("Node").Preload("ViewpointNode").Preload("ARObject").First(&feat, feat.ID)
		created = append(created, feat)
	}

	if len(created) == 0 {
		msg := "特徴点が検出できませんでした。模様や凹凸のある建物・看板などの画像を使ってください"
		if firstErr != "" {
			msg = "特徴点抽出に失敗しました: " + firstErr
		}
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": msg})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"created": created, "skipped": skipped})
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
