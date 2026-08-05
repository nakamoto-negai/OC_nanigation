package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/oc-navigation/backend/network"
)

// Network はフロントへ経路ネットワーク（ノード＋リンク）を配信する取得元。
// 具体的な DB 実装ではなくインターフェースに依存させ、main.go で実装を注入する。
// テスト時などはモックの network.Provider に差し替えられる。
var Network network.Provider

// GetRouteNetwork はノードとリンクをまとめて返す（経路ネットワーク一式）。
// フロントはこれ1回でネットワークを取得し、クライアント側 Dijkstra で経路計算できる。
// GET /api/route-network
func GetRouteNetwork(c *gin.Context) {
	snap, err := Network.Snapshot()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, snap)
}
