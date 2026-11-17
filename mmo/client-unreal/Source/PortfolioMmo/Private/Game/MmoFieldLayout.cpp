#include "Game/MmoFieldLayout.h"

#include "Data/GameData.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "World/FieldMap.h"
#include "World/Units.h"

int32 FMmoFieldLayout::KindAt(int32 X, int32 Z) const
{
	const int32 Column = X - Min;
	const int32 Row = Z - Min;
	return Column >= 0 && Row >= 0 && Column < Size && Row < Size ? Kinds[Row * Size + Column] : 0;
}

bool FMmoFieldLayout::IsOpen(int32 X, int32 Z) const
{
	const int32 Column = X - Min;
	const int32 Row = Z - Min;
	return Column >= 0 && Row >= 0 && Column < Size && Row < Size && Open[Row * Size + Column];
}

TOptional<FMmoFieldLayout> FMmoFieldLayout::Load()
{
	const FString Folder = FPaths::ConvertRelativePathToFull(FPaths::ProjectDir() / TEXT("../shared/data/files"));
	const std::optional<MmoData::FGameData> Data = MmoData::Load([&Folder](std::string_view Name) -> std::optional<std::string>
	{
		TArray<uint8> Bytes;
		if (!FFileHelper::LoadFileToArray(Bytes, *(Folder / FString(static_cast<int32>(Name.size()), Name.data())), FILEREAD_Silent))
		{
			return std::nullopt;
		}
		return std::string(reinterpret_cast<const char*>(Bytes.GetData()), Bytes.Num());
	});
	if (!Data)
	{
		return {};
	}
	const std::optional<MmoWorld::FFieldMap> Field = MmoWorld::FFieldMap::Make(Data->Constants.field_size(), Data->Zones.rows(), Data->Grid);
	if (!Field)
	{
		return {};
	}

	FMmoFieldLayout Layout;
	Layout.Min = Field->GridMin();
	Layout.Size = Field->GridSize();
	TMap<uint32, int32> KindOfZone;
	for (const portfolio::mmo::data::ZonesRow& Row : Data->Zones.rows())
	{
		Layout.Zones.Add({ FIntRect(Row.min_x(), Row.min_z(), Row.max_x(), Row.max_z()), static_cast<int32>(Row.kind()) });
		KindOfZone.Add(Row.id(), static_cast<int32>(Row.kind()));
	}
	for (const portfolio::mmo::data::NpcsRow& Row : Data->Npcs.rows())
	{
		Layout.Npcs.Add(FIntPoint(Row.x(), Row.z()));
	}
	Layout.Kinds.SetNumZeroed(Layout.Size * Layout.Size);
	Layout.Open.SetNumZeroed(Layout.Size * Layout.Size);
	for (int32 Row = 0; Row < Layout.Size; ++Row)
	{
		for (int32 Column = 0; Column < Layout.Size; ++Column)
		{
			const int32 X = Layout.Min + Column;
			const int32 Z = Layout.Min + Row;
			// 칸의 가운데(1/32 m)로 묻는다.
			const int32 Half = MmoWorld::Units::PerMeter / 2;
			const int32* Kind = KindOfZone.Find(Field->ZoneAt(X * MmoWorld::Units::PerMeter + Half, Z * MmoWorld::Units::PerMeter + Half));
			Layout.Kinds[Row * Layout.Size + Column] = Kind ? static_cast<uint8>(*Kind) : 0;
			Layout.Open[Row * Layout.Size + Column] = Field->CanWalkCell(X, Z);
		}
	}
	return Layout;
}
