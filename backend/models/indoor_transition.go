package models

import "time"

// IndoorTransition は「屋内に入る」案内カードを出す条件となるリンクのペア。
// 経路上で LinkAID と LinkBID の2リンクを連続して通過するとき（＝その間のノードを通るとき）、
// 道案内でその2ステップの間に屋内案内カードを挿入する。ImageURL があればそれを表示、
// 無ければ内蔵SVGイラストを表示する。リンクの順序は問わない（A→B / B→A どちらでも一致）。
type IndoorTransition struct {
	ID      uint `json:"id" gorm:"primaryKey;autoIncrement"`
	LinkAID uint `json:"link_a_id" gorm:"not null;index"`
	LinkBID uint `json:"link_b_id" gorm:"not null;index"`
	// Kind はカードの種別。"indoor"=屋内に入る / "outdoor"=屋外に出る。
	// 同じリンクペアの仕組みで、スイッチにより入館/退館どちらの案内も作れる。
	Kind      string    `json:"kind" gorm:"not null;default:'indoor'"`
	ImageURL  string    `json:"image_url"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
