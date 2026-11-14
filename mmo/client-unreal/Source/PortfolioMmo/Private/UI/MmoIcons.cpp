#include "UI/MmoIcons.h"

#include "Engine/Texture2D.h"

UTexture2D* UMmoIcons::Load(EMmoIconKind Kind, int32 Id) const
{
	const FMmoIcon* Row = Rows.FindByPredicate([Kind, Id](const FMmoIcon& Icon) { return Icon.Kind == Kind && Icon.Id == Id; });
	return Row ? Row->Texture.LoadSynchronous() : nullptr;
}
