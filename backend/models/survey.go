package models

import "time"

// SurveyQuestion はアンケートの1問。管理画面で自由に追加・並べ替え・有効/無効を切り替える。
//   Type = "likert" … 1〜ScaleMax の段階評価。MinLabel/MaxLabel は両端の説明。
//   Type = "text"   … 自由記述。
// Required が true の質問は未回答だと送信できない。
type SurveyQuestion struct {
	ID        uint   `json:"id" gorm:"primaryKey;autoIncrement"`
	Text      string `json:"text" gorm:"not null"`
	Type      string `json:"type" gorm:"not null;default:'likert'"` // "likert" | "text"
	Required  bool   `json:"required" gorm:"not null;default:false"`
	// Page は表示ページ番号。同じ番号の質問が同一ページにまとまって表示される。
	// ページの表示順は番号の昇順、ページ内の順序は SortOrder。
	Page      int `json:"page" gorm:"not null;default:1"`
	SortOrder int `json:"sort_order" gorm:"not null;default:0"`
	IsActive  bool `json:"is_active" gorm:"not null;default:true"`
	// likert 用（min は常に 1）
	ScaleMax int    `json:"scale_max" gorm:"not null;default:5"`
	MinLabel string `json:"min_label" gorm:"default:''"`
	MaxLabel string `json:"max_label" gorm:"default:''"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// SurveyResponse は1回分の回答（＝1端末の1提出）。device_id で利用者と紐づく。
type SurveyResponse struct {
	ID        uint           `json:"id" gorm:"primaryKey;autoIncrement"`
	DeviceID  string         `json:"device_id" gorm:"index;not null"`
	CreatedAt time.Time      `json:"created_at"`
	Answers   []SurveyAnswer `json:"answers" gorm:"foreignKey:ResponseID;constraint:OnDelete:CASCADE"`
}

// SurveyAnswer は1問に対する1回答。
// 質問が後で編集・削除されても回答の意味が失われないよう、質問文と種別のスナップショットを保持する。
type SurveyAnswer struct {
	ID           uint   `json:"id" gorm:"primaryKey;autoIncrement"`
	ResponseID   uint   `json:"response_id" gorm:"index;not null"`
	QuestionID   uint   `json:"question_id" gorm:"index;not null"`
	Value        int    `json:"value"` // likert の選択値（text のときは 0）
	Text         string `json:"text"`  // 記述回答（likert のときは空）
	QuestionText string `json:"question_text"`
	QuestionType string `json:"question_type"`
}
