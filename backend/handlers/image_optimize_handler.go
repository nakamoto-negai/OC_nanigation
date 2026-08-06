package handlers

import (
	"bytes"
	"image"
	"image/draw"
	"image/jpeg"
	"image/png"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

// アップロード画像の一括最適化（画素数を下げて同名ファイルに上書き）。
// 全モデルは /uploads/<name> の URL を持つだけなので、ファイル名を保ったまま
// その場で縮小すれば DB 変更なしで全種類（道中写真・到着写真・合成素材・マップ・
// お知らせ・屋内案内など）に一律で効く。管理者のみ。

func optImageDir() string {
	d := os.Getenv("UPLOAD_DIR")
	if d == "" {
		d = "./uploads"
	}
	return d
}

// 対象拡張子。標準ライブラリで安全に再エンコードできるものだけ扱う（webp/gif 等は対象外）。
var optExts = map[string]bool{".jpg": true, ".jpeg": true, ".png": true}

type imageStat struct {
	Name   string `json:"name"`
	URL    string `json:"url"`
	Bytes  int64  `json:"bytes"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}

// ListImageStats はアップロード済み画像の一覧（サイズ・寸法）と合計を返す。
func ListImageStats(c *gin.Context) {
	dir := optImageDir()
	entries, err := os.ReadDir(dir)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"count": 0, "total_bytes": 0, "items": []imageStat{}})
		return
	}
	items := make([]imageStat, 0, len(entries))
	var total int64
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(e.Name()))
		if !optExts[ext] {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		st := imageStat{Name: e.Name(), URL: "/uploads/" + e.Name(), Bytes: info.Size()}
		// 寸法はヘッダーだけ読む（デコードしないので軽量）
		if f, ferr := os.Open(filepath.Join(dir, e.Name())); ferr == nil {
			if cfg, _, cerr := image.DecodeConfig(f); cerr == nil {
				st.Width = cfg.Width
				st.Height = cfg.Height
			}
			f.Close()
		}
		total += info.Size()
		items = append(items, st)
	}
	c.JSON(http.StatusOK, gin.H{"count": len(items), "total_bytes": total, "items": items})
}

type optimizeResultItem struct {
	Name        string `json:"name"`
	BeforeW     int    `json:"before_w"`
	BeforeH     int    `json:"before_h"`
	AfterW      int    `json:"after_w"`
	AfterH      int    `json:"after_h"`
	BeforeBytes int64  `json:"before_bytes"`
	AfterBytes  int64  `json:"after_bytes"`
	Status      string `json:"status"` // resized | skipped | failed
}

// OptimizeImages は max_edge を超える画像を長辺 max_edge に縮小し、同名で上書きする。
func OptimizeImages(c *gin.Context) {
	var body struct {
		MaxEdge int `json:"max_edge"`
		Quality int `json:"quality"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.MaxEdge < 200 {
		body.MaxEdge = 1600
	}
	if body.Quality < 40 || body.Quality > 100 {
		body.Quality = 82
	}

	dir := optImageDir()
	entries, err := os.ReadDir(dir)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"processed": 0, "skipped": 0, "failed": 0, "bytes_before": 0, "bytes_after": 0, "items": []optimizeResultItem{}})
		return
	}

	var processed, skipped, failed int
	var bytesBefore, bytesAfter int64
	items := make([]optimizeResultItem, 0)

	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(e.Name()))
		if !optExts[ext] {
			continue
		}
		info, ierr := e.Info()
		if ierr != nil {
			continue
		}
		res := optimizeOneImage(filepath.Join(dir, e.Name()), ext, body.MaxEdge, body.Quality, info.Size())
		switch res.Status {
		case "resized":
			processed++
			bytesBefore += res.BeforeBytes
			bytesAfter += res.AfterBytes
			items = append(items, res)
		case "failed":
			failed++
			items = append(items, res)
		default:
			skipped++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"target_max_edge": body.MaxEdge,
		"quality":         body.Quality,
		"processed":       processed,
		"skipped":         skipped,
		"failed":          failed,
		"bytes_before":    bytesBefore,
		"bytes_after":     bytesAfter,
		"items":           items,
	})
}

// optimizeOneImage は 1 枚を縮小して上書きする。長辺が maxEdge 以下なら触らない（skipped）。
func optimizeOneImage(path, ext string, maxEdge, quality int, beforeBytes int64) optimizeResultItem {
	res := optimizeResultItem{Name: filepath.Base(path), BeforeBytes: beforeBytes, Status: "skipped"}

	f, err := os.Open(path)
	if err != nil {
		res.Status = "failed"
		return res
	}
	src, _, err := image.Decode(f)
	f.Close()
	if err != nil {
		res.Status = "failed"
		return res
	}
	b := src.Bounds()
	sw, sh := b.Dx(), b.Dy()
	res.BeforeW, res.BeforeH = sw, sh

	longEdge := sw
	if sh > longEdge {
		longEdge = sh
	}
	if longEdge <= maxEdge {
		return res // 既に十分小さい
	}

	scale := float64(maxEdge) / float64(longEdge)
	dw := int(float64(sw)*scale + 0.5)
	dh := int(float64(sh)*scale + 0.5)
	if dw < 1 {
		dw = 1
	}
	if dh < 1 {
		dh = 1
	}

	dst := downscaleNRGBA(toNRGBA(src), dw, dh)

	var buf bytes.Buffer
	if ext == ".png" {
		enc := png.Encoder{CompressionLevel: png.BestCompression}
		if eerr := enc.Encode(&buf, dst); eerr != nil {
			res.Status = "failed"
			return res
		}
	} else {
		if eerr := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: quality}); eerr != nil {
			res.Status = "failed"
			return res
		}
	}

	// エンコード成功後に一括で上書き（途中失敗で元ファイルを壊さないため）。
	if werr := os.WriteFile(path, buf.Bytes(), 0644); werr != nil {
		res.Status = "failed"
		return res
	}
	res.AfterW, res.AfterH = dw, dh
	res.AfterBytes = int64(buf.Len())
	res.Status = "resized"
	return res
}

// toNRGBA は任意の画像を原点(0,0)基準の *image.NRGBA に正規化する（Pix を直接インデックスするため）。
func toNRGBA(src image.Image) *image.NRGBA {
	if n, ok := src.(*image.NRGBA); ok && n.Rect.Min.X == 0 && n.Rect.Min.Y == 0 {
		return n
	}
	b := src.Bounds()
	dst := image.NewNRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	draw.Draw(dst, dst.Bounds(), src, b.Min, draw.Src)
	return dst
}

// downscaleNRGBA はアルファ重み付きの面積平均で縮小する（縮小専用）。
// 透明画素の色が滲まないよう、色はアルファで重み付けして平均する。
func downscaleNRGBA(src *image.NRGBA, dw, dh int) *image.NRGBA {
	sw := src.Rect.Dx()
	sh := src.Rect.Dy()
	dst := image.NewNRGBA(image.Rect(0, 0, dw, dh))
	for dy := 0; dy < dh; dy++ {
		sy0 := dy * sh / dh
		sy1 := (dy + 1) * sh / dh
		if sy1 <= sy0 {
			sy1 = sy0 + 1
		}
		for dx := 0; dx < dw; dx++ {
			sx0 := dx * sw / dw
			sx1 := (dx + 1) * sw / dw
			if sx1 <= sx0 {
				sx1 = sx0 + 1
			}
			var sumR, sumG, sumB, sumA, count uint64
			for sy := sy0; sy < sy1; sy++ {
				off := sy*src.Stride + sx0*4
				for sx := sx0; sx < sx1; sx++ {
					a := uint64(src.Pix[off+3])
					sumR += uint64(src.Pix[off]) * a
					sumG += uint64(src.Pix[off+1]) * a
					sumB += uint64(src.Pix[off+2]) * a
					sumA += a
					count++
					off += 4
				}
			}
			o := dst.PixOffset(dx, dy)
			if sumA == 0 {
				dst.Pix[o], dst.Pix[o+1], dst.Pix[o+2], dst.Pix[o+3] = 0, 0, 0, 0
			} else {
				dst.Pix[o] = uint8(sumR / sumA)
				dst.Pix[o+1] = uint8(sumG / sumA)
				dst.Pix[o+2] = uint8(sumB / sumA)
				dst.Pix[o+3] = uint8(sumA / count)
			}
		}
	}
	return dst
}
