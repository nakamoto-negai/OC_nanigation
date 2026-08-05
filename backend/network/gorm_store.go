package network

import (
	"github.com/oc-navigation/backend/models"
	"gorm.io/gorm"
)

// GormStore は GORM/PostgreSQL からノード・リンクを読み出す Store 実装。
// ＝「データベースからネットワークを作成する部分」の具体実装。
type GormStore struct {
	db *gorm.DB
}

// NewGormStore は *gorm.DB を包んで Store を返す。
func NewGormStore(db *gorm.DB) *GormStore {
	return &GormStore{db: db}
}

func sortedByOrder(db *gorm.DB) *gorm.DB {
	return db.Order("sort_order asc")
}

// FetchNodes は全ノードを読み出す（既存の GET /api/nodes と同じ内容）。
func (s *GormStore) FetchNodes() ([]models.Node, error) {
	var nodes []models.Node
	if err := s.db.Find(&nodes).Error; err != nil {
		return nil, err
	}
	return nodes, nil
}

// FetchLinks は全リンクを、写真・到着写真（順序つき）・両端ノードを preload して読み出す
// （既存の GET /api/links と同じ内容）。
func (s *GormStore) FetchLinks() ([]models.Link, error) {
	var links []models.Link
	if err := s.db.
		Preload("Photos", sortedByOrder).
		Preload("ArrivalPhotos", sortedByOrder).
		Preload("FromNode").Preload("ToNode").
		Find(&links).Error; err != nil {
		return nil, err
	}
	return links, nil
}
