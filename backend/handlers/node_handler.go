package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/oc-navigation/backend/database"
	"github.com/oc-navigation/backend/models"
	"gorm.io/gorm"
)

func ListNodes(c *gin.Context) {
	var nodes []models.Node
	database.DB.
		Preload("Category").
		Preload("Events", func(db *gorm.DB) *gorm.DB { return db.Order("sort_order asc").Order("id asc") }).
		Find(&nodes)
	c.JSON(http.StatusOK, nodes)
}

func GetNode(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var node models.Node
	if err := database.DB.Preload("Category").First(&node, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "node not found"})
		return
	}
	c.JSON(http.StatusOK, node)
}

func CreateNode(c *gin.Context) {
	var node models.Node
	if err := c.ShouldBindJSON(&node); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := database.DB.Create(&node).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, node)
}

func UpdateNode(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var node models.Node
	if err := database.DB.First(&node, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "node not found"})
		return
	}
	if err := c.ShouldBindJSON(&node); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	database.DB.Save(&node)
	database.DB.Preload("Category").First(&node, node.ID)
	c.JSON(http.StatusOK, node)
}

// DeleteNode はノードと、それを参照するレコードをまとめて削除する。
// ノードは Link(from/to)・NodeDetour(node/detour)・ARFeature(node/viewpoint) から
// 外部キー参照されており、そのまま削除すると FK 制約で失敗する。関連を先に片付けてから消す。
func DeleteNode(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	nid := uint(id)

	err := database.DB.Transaction(func(tx *gorm.DB) error {
		// このノードに接続するリンク（写真は links の OnDelete:CASCADE で連鎖削除）
		if err := tx.Where("from_node_id = ? OR to_node_id = ?", nid, nid).Delete(&models.Link{}).Error; err != nil {
			return err
		}
		// 寄り道（元ノード・寄り道先どちらの参照も削除）
		if err := tx.Where("node_id = ? OR detour_node_id = ?", nid, nid).Delete(&models.NodeDetour{}).Error; err != nil {
			return err
		}
		// AR 参照はレコードは残し、紐づけ（建物ノード / 視点ノード）だけ NULL に戻す
		if err := tx.Model(&models.ARFeature{}).Where("node_id = ?", nid).Update("node_id", nil).Error; err != nil {
			return err
		}
		if err := tx.Model(&models.ARFeature{}).Where("viewpoint_node_id = ?", nid).Update("viewpoint_node_id", nil).Error; err != nil {
			return err
		}
		// この地点のイベント
		if err := tx.Where("node_id = ?", nid).Delete(&models.Event{}).Error; err != nil {
			return err
		}
		// ノード本体
		return tx.Delete(&models.Node{}, nid).Error
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
