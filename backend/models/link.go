package models

import "time"

type Link struct {
	ID            uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	Name          string    `json:"name"`
	Description   string    `json:"description"`
	FromNodeID    uint      `json:"from_node_id" gorm:"not null"`
	ToNodeID      uint      `json:"to_node_id" gorm:"not null"`
	FromNode      *Node     `json:"from_node,omitempty" gorm:"foreignKey:FromNodeID"`
	ToNode        *Node     `json:"to_node,omitempty" gorm:"foreignKey:ToNodeID"`
	Distance      float64   `json:"distance" gorm:"not null;default:1"`
	// この区間を進むと屋内に入る。true のとき道案内でこのカードの直後に屋内案内カードを表示する。
	EntersIndoors bool      `json:"enters_indoors" gorm:"not null;default:false"`
	// 屋内案内カードに表示する画像。未設定なら内蔵SVGイラストを表示する。
	IndoorImageURL string   `json:"indoor_image_url" gorm:"default:''"`
	Photos        []Photo   `json:"photos" gorm:"foreignKey:LinkID;constraint:OnDelete:CASCADE"`
	// 到着地点の写真（「到着地点を確認する」で表示。道中スライダーの Photos とは別系統）
	ArrivalPhotos []ArrivalPhoto `json:"arrival_photos" gorm:"foreignKey:LinkID;constraint:OnDelete:CASCADE"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type Photo struct {
	ID        uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	LinkID    uint      `json:"link_id" gorm:"not null"`
	SortOrder int       `json:"sort_order" gorm:"default:0"`
	URL       string    `json:"url" gorm:"not null"`
	Caption   string    `json:"caption"`
	CreatedAt time.Time `json:"created_at"`
}
