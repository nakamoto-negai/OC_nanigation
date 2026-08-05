// Package network は経路ネットワーク（ノードとリンク）に関する2つの層をインターフェース化する。
//
//   Store    … 「データベースからネットワークを作成する（読み出す）部分」を抽象化する。
//              既定実装は GORM/PostgreSQL（GormStore）。別ストレージやモックに差し替え可能。
//   Provider … フロントへ配信する経路ネットワークを組み立てて返す部分。Store に依存し、
//              具体的な DB 実装を知らない。ハンドラはこの Provider にだけ依存する。
//
// フロントはこのネットワークを受け取り、クライアント側 Dijkstra
// (frontend/src/utils/dijkstra.ts) で経路計算する。
package network

import "github.com/oc-navigation/backend/models"

// Snapshot は経路ネットワーク一式（ノードとリンク）。
type Snapshot struct {
	Nodes []models.Node `json:"nodes"`
	Links []models.Link `json:"links"`
}

// Store はデータストア（DB 等）から経路ネットワークの素材を読み出す層。
// ＝「データベースからネットワークを作成する部分」の抽象。
type Store interface {
	// FetchNodes は全ノードを読み出す。
	FetchNodes() ([]models.Node, error)
	// FetchLinks は全リンクを、表示・経路計算に必要な関連（写真・両端ノード）つきで読み出す。
	FetchLinks() ([]models.Link, error)
}

// Provider はフロントへ配信する経路ネットワークを組み立てて返す層。
type Provider interface {
	Nodes() ([]models.Node, error)
	Links() ([]models.Link, error)
	Snapshot() (Snapshot, error)
}

// provider は Store から素材を取得して経路ネットワークを組み立てる既定の Provider 実装。
// Store インターフェースにだけ依存し、DB の具体実装は知らない。
type provider struct {
	store Store
}

// NewProvider は Store を包んで Provider を返す。
func NewProvider(store Store) Provider {
	return &provider{store: store}
}

func (p *provider) Nodes() ([]models.Node, error) { return p.store.FetchNodes() }
func (p *provider) Links() ([]models.Link, error) { return p.store.FetchLinks() }

func (p *provider) Snapshot() (Snapshot, error) {
	nodes, err := p.store.FetchNodes()
	if err != nil {
		return Snapshot{}, err
	}
	links, err := p.store.FetchLinks()
	if err != nil {
		return Snapshot{}, err
	}
	return Snapshot{Nodes: nodes, Links: links}, nil
}
