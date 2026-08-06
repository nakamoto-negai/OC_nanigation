package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/oc-navigation/backend/database"
	"github.com/oc-navigation/backend/models"
	"gorm.io/gorm"
)

// destinationInput は目的地の作成・更新リクエスト。
// NodeIDs で所属ノード（多対多）を張り替える。
type destinationInput struct {
	Name       string `json:"name"`
	CategoryID *uint  `json:"category_id"`
	SortOrder  int    `json:"sort_order"`
	IsBusStop  bool   `json:"is_bus_stop"`
	NodeIDs    []uint `json:"node_ids"`
}

func ListDestinations(c *gin.Context) {
	var destinations []models.Destination
	database.DB.
		Preload("Category").
		Preload("Events", func(db *gorm.DB) *gorm.DB { return db.Order("sort_order asc").Order("id asc") }).
		Preload("Events.Category").
		Preload("Nodes").
		Order("sort_order asc, id asc").
		Find(&destinations)
	c.JSON(http.StatusOK, destinations)
}

// nodesFromIDs は ID の列から、関連付け用の Node スライス（IDのみ）を作る。
func nodesFromIDs(ids []uint) []models.Node {
	nodes := make([]models.Node, 0, len(ids))
	for _, id := range ids {
		nodes = append(nodes, models.Node{ID: id})
	}
	return nodes
}

func CreateDestination(c *gin.Context) {
	var in destinationInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if in.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name は必須です"})
		return
	}
	dest := models.Destination{Name: in.Name, CategoryID: in.CategoryID, SortOrder: in.SortOrder, IsBusStop: in.IsBusStop}
	if err := database.DB.Create(&dest).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if len(in.NodeIDs) > 0 {
		if err := database.DB.Model(&dest).Association("Nodes").Replace(nodesFromIDs(in.NodeIDs)); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	reloadDestination(&dest)
	c.JSON(http.StatusCreated, dest)
}

func UpdateDestination(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var dest models.Destination
	if err := database.DB.First(&dest, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "destination not found"})
		return
	}
	var in destinationInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if in.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name は必須です"})
		return
	}
	dest.Name = in.Name
	dest.CategoryID = in.CategoryID
	dest.SortOrder = in.SortOrder
	dest.IsBusStop = in.IsBusStop
	if err := database.DB.Save(&dest).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// 所属ノードを丸ごと張り替える（空なら全解除）。
	if err := database.DB.Model(&dest).Association("Nodes").Replace(nodesFromIDs(in.NodeIDs)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	reloadDestination(&dest)
	c.JSON(http.StatusOK, dest)
}

// DeleteDestination は目的地と、それに紐づくイベント・多対多の所属を削除する。
func DeleteDestination(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	err := database.DB.Transaction(func(tx *gorm.DB) error {
		var dest models.Destination
		if err := tx.First(&dest, id).Error; err != nil {
			return err
		}
		// 多対多の所属を全解除（destination_nodes の行を削除）
		if err := tx.Model(&dest).Association("Nodes").Clear(); err != nil {
			return err
		}
		// この目的地のイベント
		if err := tx.Where("destination_id = ?", id).Delete(&models.Event{}).Error; err != nil {
			return err
		}
		return tx.Delete(&models.Destination{}, id).Error
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func reloadDestination(dest *models.Destination) {
	database.DB.
		Preload("Category").
		Preload("Events", func(db *gorm.DB) *gorm.DB { return db.Order("sort_order asc").Order("id asc") }).
		Preload("Events.Category").
		Preload("Nodes").
		First(dest, dest.ID)
}
