package models

import "time"

// Event は、ある目的地（Destination）で開催されるイベント。
// 目的地選択画面で、その目的地のカードにイベント名を流して表示するのに使う。
// また CategoryID でイベント自身をカテゴリーに紐付け、イベント選択画面では
// （目的地のカテゴリーではなく）このイベント自身のカテゴリーで分類して表示する。
// DestinationID / CategoryID をポインタ（nullable）にしているのは、既存行がある events 表へ
// AutoMigrate で FK 付きの新カラムを追加する際、NOT NULL だと既存行が制約違反で
// 失敗するため。必須性はハンドラ側のバリデーションで担保する（カテゴリーは任意）。
type Event struct {
	ID            uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	DestinationID *uint     `json:"destination_id" gorm:"index"`
	CategoryID    *uint     `json:"category_id" gorm:"index"`
	Category      *Category `json:"category,omitempty" gorm:"foreignKey:CategoryID"`
	Name          string    `json:"name" gorm:"not null"`
	SortOrder     int       `json:"sort_order" gorm:"default:0"`
	// スタンプラリー対象イベント。true のときイベント選択で「スタンプラリー対象」ラベルを表示する。
	IsStampRally  bool      `json:"is_stamp_rally" gorm:"not null;default:false"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}
