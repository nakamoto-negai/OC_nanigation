package models

import "time"

type Node struct {
	ID           uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	Name         string    `json:"name" gorm:"not null"`
	Description  string    `json:"description"`
	X            float64   `json:"x" gorm:"not null"`
	Y            float64   `json:"y" gorm:"not null"`
	Lat          *float64  `json:"lat"`
	Lng          *float64  `json:"lng"`
	IsSelectable bool      `json:"is_selectable" gorm:"not null;default:true"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// NodeDetour はノード同士の寄り道提案ペアリングを管理する中間テーブル。
// NodeID と DetourNodeID にそれぞれ一意制約を付けて一対一対応を強制する。
type NodeDetour struct {
	ID           uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	NodeID       uint      `json:"node_id" gorm:"not null;uniqueIndex"`
	DetourNodeID uint      `json:"detour_node_id" gorm:"not null;uniqueIndex"`
	Node         *Node     `json:"node,omitempty" gorm:"foreignKey:NodeID"`
	DetourNode   *Node     `json:"detour_node,omitempty" gorm:"foreignKey:DetourNodeID"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}
