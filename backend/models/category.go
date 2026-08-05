package models

import "time"

type Category struct {
	ID   uint   `json:"id" gorm:"primaryKey;autoIncrement"`
	Name string `json:"name" gorm:"not null"`
	// 所属する大カテゴリー（任意）。未設定なら「その他」の大カテゴリー扱い。
	SuperCategoryID *uint          `json:"super_category_id"`
	SuperCategory   *SuperCategory `json:"super_category,omitempty" gorm:"foreignKey:SuperCategoryID"`
	SortOrder       int            `json:"sort_order" gorm:"not null;default:0"`
	IsOpenDefault   bool           `json:"is_open_default" gorm:"not null;default:true"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
}
