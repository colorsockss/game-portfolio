import type { InventoryViewModel, ItemSlot } from "../../presentation/view-models/inventory.js";
import { button, icon, label, list, row, tabBar, text, view } from "../binding/view.js";

/** 가방 그리드의 칸 하나(InventoryCell). */
const slotRow = row<ItemSlot>({
  icon: icon(slot => slot.icon),
  nameText: text(slot => slot.name),
  amountText: text(slot => slot.amount),
});

export const inventoryView = view<InventoryViewModel>("UI/InventoryScreen", {
  tabs: tabBar(vm => vm.tabs),
  items: list(vm => vm.slots, slotRow),
  closeButton: button(vm => vm.close()),
  titleLabel: label("menu.inventory"),
  closeLabel: label("common.close"),
}, "popup");
