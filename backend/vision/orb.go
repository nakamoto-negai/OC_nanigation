// Package vision はサーバーサイドの画像特徴点抽出（OpenCV/gocv）をまとめる。
//
// 管理画面の AR 登録では、以前はブラウザの OpenCV.js で ORB を抽出していたが、
// CDN ロードや Web Worker の不安定さでエラーが頻発したため、抽出をサーバーへ移した。
// ここで生成する記述子は OpenCV の ORB 実装そのものなので、認識側（フロントの
// opencv.js）の ORB 記述子と Hamming 距離でそのままマッチングできる（バイナリ互換）。
package vision

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"image"

	"gocv.io/x/gocv"
)

// 抽出時に画像の長辺をこのピクセル数まで縮小する（大きすぎる画像で ORB が遅く・重くなるのを防ぐ）。
// keypoint 座標はこの縮小後の画像が基準になり、結果の Width/Height と整合する。
const maxImageSide = 1280

// Keypoint は ORB が検出した特徴点。フロントの utils/opencv.ts の Keypoint と同じ形。
type Keypoint struct {
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Size     float64 `json:"size"`
	Angle    float64 `json:"angle"`
	Response float64 `json:"response"`
	Octave   int     `json:"octave"`
}

// ORBResult は抽出結果。フロントが multipart で送っていた各フィールドに対応する。
type ORBResult struct {
	KeypointsJSON string // [{x,y,size,angle,response,octave}, ...] の JSON 文字列
	Descriptors   string // ORB 記述子（CV_8U, rows×cols）を base64 化したもの
	DescRows      int
	DescCols      int
	KeypointCount int
	Width         int // 抽出に用いた（縮小後の）画像幅。keypoint 座標の基準
	Height        int
}

// ExtractORB は画像バイト列（JPEG/PNG 等）から ORB 特徴点と記述子を抽出する。
// maxFeatures は検出する最大特徴点数（フロントの「最大特徴点数」と同義）。
func ExtractORB(imageData []byte, maxFeatures int) (*ORBResult, error) {
	if len(imageData) == 0 {
		return nil, errors.New("画像データが空です")
	}
	if maxFeatures <= 0 {
		maxFeatures = 500
	}

	// デコード（カラー）
	src, err := gocv.IMDecode(imageData, gocv.IMReadColor)
	if err != nil {
		return nil, err
	}
	defer src.Close()
	if src.Empty() {
		return nil, errors.New("画像をデコードできませんでした")
	}

	// 長辺が maxImageSide を超えるなら縮小
	work := src
	resized := gocv.NewMat()
	defer resized.Close()
	w, h := src.Cols(), src.Rows()
	if long := max(w, h); long > maxImageSide {
		scale := float64(maxImageSide) / float64(long)
		nw := int(float64(w) * scale)
		nh := int(float64(h) * scale)
		gocv.Resize(src, &resized, image.Point{X: nw, Y: nh}, 0, 0, gocv.InterpolationArea)
		work = resized
	}

	// グレースケール化
	gray := gocv.NewMat()
	defer gray.Close()
	gocv.CvtColor(work, &gray, gocv.ColorBGRToGray)

	// ORB 検出＋記述子計算（引数は OpenCV のデフォルトに準拠）
	orb := gocv.NewORBWithParams(maxFeatures, 1.2, 8, 31, 0, 2, gocv.ORBScoreTypeHarris, 31, 20)
	defer orb.Close()
	mask := gocv.NewMat()
	defer mask.Close()

	kps, desc := orb.DetectAndCompute(gray, mask)
	defer desc.Close()

	keypoints := make([]Keypoint, 0, len(kps))
	for _, kp := range kps {
		keypoints = append(keypoints, Keypoint{
			X:        kp.X,
			Y:        kp.Y,
			Size:     kp.Size,
			Angle:    kp.Angle,
			Response: kp.Response,
			Octave:   kp.Octave,
		})
	}

	kpJSON, err := json.Marshal(keypoints)
	if err != nil {
		return nil, err
	}

	descB64 := ""
	descRows, descCols := 0, 0
	if !desc.Empty() {
		descRows = desc.Rows()
		descCols = desc.Cols()
		descB64 = base64.StdEncoding.EncodeToString(desc.ToBytes())
	}

	return &ORBResult{
		KeypointsJSON: string(kpJSON),
		Descriptors:   descB64,
		DescRows:      descRows,
		DescCols:      descCols,
		KeypointCount: len(keypoints),
		Width:         work.Cols(),
		Height:        work.Rows(),
	}, nil
}
