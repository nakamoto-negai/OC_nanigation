package algorithms

import (
	"container/heap"
	"math"

	"github.com/oc-navigation/backend/models"
)

type Edge struct {
	To       uint
	Weight   float64
	LinkID   uint
}

type Item struct {
	nodeID uint
	cost   float64
	index  int
}

type PriorityQueue []*Item

func (pq PriorityQueue) Len() int            { return len(pq) }
func (pq PriorityQueue) Less(i, j int) bool  { return pq[i].cost < pq[j].cost }
func (pq PriorityQueue) Swap(i, j int)       { pq[i], pq[j] = pq[j], pq[i]; pq[i].index = i; pq[j].index = j }
func (pq *PriorityQueue) Push(x interface{}) { item := x.(*Item); item.index = len(*pq); *pq = append(*pq, item) }
func (pq *PriorityQueue) Pop() interface{}   { old := *pq; n := len(old); item := old[n-1]; *pq = old[:n-1]; return item }

type RouteStep struct {
	LinkID uint
	FromID uint
	ToID   uint
}

type RouteResult struct {
	Steps    []RouteStep
	NodePath []uint
	Total    float64
}

func Dijkstra(links []models.Link, startID, goalID uint) *RouteResult {
	graph := make(map[uint][]Edge)
	for _, l := range links {
		graph[l.FromNodeID] = append(graph[l.FromNodeID], Edge{To: l.ToNodeID, Weight: l.Distance, LinkID: l.ID})
		if l.Bidirectional {
			graph[l.ToNodeID] = append(graph[l.ToNodeID], Edge{To: l.FromNodeID, Weight: l.Distance, LinkID: l.ID})
		}
	}

	dist := make(map[uint]float64)
	prev := make(map[uint]uint)
	prevLink := make(map[uint]uint)

	pq := &PriorityQueue{}
	heap.Init(pq)
	heap.Push(pq, &Item{nodeID: startID, cost: 0})
	dist[startID] = 0

	for pq.Len() > 0 {
		cur := heap.Pop(pq).(*Item)
		if cur.nodeID == goalID {
			break
		}
		if d, ok := dist[cur.nodeID]; ok && cur.cost > d {
			continue
		}
		for _, edge := range graph[cur.nodeID] {
			newCost := cur.cost + edge.Weight
			if d, ok := dist[edge.To]; !ok || newCost < d {
				dist[edge.To] = newCost
				prev[edge.To] = cur.nodeID
				prevLink[edge.To] = edge.LinkID
				heap.Push(pq, &Item{nodeID: edge.To, cost: newCost})
			}
		}
	}

	if _, ok := dist[goalID]; !ok {
		return nil
	}

	var nodePath []uint
	for at := goalID; at != startID; at = prev[at] {
		nodePath = append([]uint{at}, nodePath...)
	}
	nodePath = append([]uint{startID}, nodePath...)

	var steps []RouteStep
	for i := 1; i < len(nodePath); i++ {
		steps = append(steps, RouteStep{
			LinkID: prevLink[nodePath[i]],
			FromID: nodePath[i-1],
			ToID:   nodePath[i],
		})
	}

	total := dist[goalID]
	if total == math.MaxFloat64 {
		return nil
	}

	return &RouteResult{Steps: steps, NodePath: nodePath, Total: total}
}
