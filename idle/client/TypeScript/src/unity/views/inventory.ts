import type { InventoryViewModel, ItemSlot } from "../../presentation/view-models/inventory.js";
import { icon, label, list, row, tabBar, text, tint, view } from "../binding/view.js";

/** 가방 그리드의 칸 하나(InventoryCell). */
const slotRow = row<ItemSlot>({
  icon: icon(slot => slot.icon),
  nameText: text(slot => slot.name),
  amountText: text(slot => slot.amount),
  tint: tint(slot => slot.tint),
});

// 프리팹은 Tools/UI/Build Inventory Prefabs(Assets/Editor/UI/InventoryPrefabs.cs)가 만든다. 메인 화면 아래 탭 위의 판이다.

export const inventoryView = view<InventoryViewModel>("UI/InventoryScreen", {
  tabs: tabBar(vm => vm.tabs),
  items: list(vm => vm.slots, slotRow),
  titleLabel: label("menu.inventory"),
});
