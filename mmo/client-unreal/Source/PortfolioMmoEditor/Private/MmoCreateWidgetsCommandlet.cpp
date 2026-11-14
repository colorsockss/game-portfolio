#include "MmoCreateWidgetsCommandlet.h"

#include "AssetRegistry/AssetRegistryModule.h"
#include "Blueprint/WidgetBlueprintGeneratedClass.h"
#include "Blueprint/WidgetTree.h"
#include "Brushes/SlateRoundedBoxBrush.h"
#include "Components/Border.h"
#include "Components/Button.h"
#include "Components/ButtonSlot.h"
#include "Components/CanvasPanel.h"
#include "Components/CanvasPanelSlot.h"
#include "Components/EditableTextBox.h"
#include "Components/HorizontalBox.h"
#include "Components/HorizontalBoxSlot.h"
#include "Components/Image.h"
#include "Components/Overlay.h"
#include "Components/ProgressBar.h"
#include "Components/ScrollBox.h"
#include "Components/OverlaySlot.h"
#include "Components/SafeZone.h"
#include "Components/SafeZoneSlot.h"
#include "Components/SizeBox.h"
#include "Components/TextBlock.h"
#include "Components/TileView.h"
#include "Components/UniformGridPanel.h"
#include "Components/UniformGridSlot.h"
#include "Components/VerticalBox.h"
#include "Components/VerticalBoxSlot.h"
#include "Engine/Texture2D.h"
#include "HAL/FileManager.h"
#include "Kismet2/KismetEditorUtilities.h"
#include "UObject/SavePackage.h"
#include "UI/MmoButtonWidget.h"
#include "UI/MmoCharacterCreateWidget.h"
#include "UI/MmoChatWidget.h"
#include "UI/MmoCharacterWidget.h"
#include "UI/MmoCharacterSelectWidget.h"
#include "UI/MmoConfirmWidget.h"
#include "UI/MmoDeathWidget.h"
#include "UI/MmoHudWidget.h"
#include "UI/MmoInventoryWidget.h"
#include "UI/MmoEnchantWidget.h"
#include "UI/MmoItemDetailWidget.h"
#include "UI/MmoItemSlotWidget.h"
#include "UI/MmoIcons.h"
#include "UI/MmoJoystickWidget.h"
#include "UI/MmoLoginWidget.h"
#include "UI/MmoNameTagWidget.h"
#include "UI/MmoNoticeWidget.h"
#include "UI/MmoPartyWidget.h"
#include "UI/MmoQuantityWidget.h"
#include "UI/MmoQuickslotBarWidget.h"
#include "UI/MmoShopWidget.h"
#include "UI/MmoStorageWidget.h"
#include "UI/MmoMapWidget.h"
#include "UI/MmoSkillsWidget.h"
#include "UI/MmoSettingsWidget.h"
#include "UI/MmoTextBlock.h"
#include "UI/MmoUiPaths.h"
#include "UObject/SavePackage.h"
#include "WidgetBlueprint.h"


DEFINE_LOG_CATEGORY_STATIC(LogMmoCreateWidgets, Log, All);

namespace
{
	/**
	 * 스타일 표. 모든 화면의 색, 글꼴 크기, 버튼과 창 틀의 모양을 여기 한 곳에 두고, 화면을 만드는 함수는 이 값만 쓴다.
	 * 값 하나를 바꾸고 생성기를 다시 돌리면 모든 화면이 바뀐다. 기준 해상도는 1920×1080이고, 화면의 짧은 변으로 배율을 정한다
	 * (DefaultEngine.ini의 UI 배율 곡선). 탭과 목록은 처음 쓰는 항목이 여기에 줄을 더한다.
	 */
	struct FMmoStyle
	{
		FLinearColor Backdrop{ 0.02f, 0.02f, 0.03f, 1.0f };
		FLinearColor Dim{ 0.0f, 0.0f, 0.0f, 0.5f };
		FLinearColor Panel{ 0.06f, 0.07f, 0.09f, 0.96f };
		FLinearColor Text{ 0.92f, 0.92f, 0.90f, 1.0f };
		FLinearColor Positive{ 0.45f, 0.9f, 0.55f, 1.0f };
		FLinearColor Negative{ 1.0f, 0.4f, 0.35f, 1.0f };
		FLinearColor Shadow{ 0.0f, 0.0f, 0.0f, 0.8f };
		FLinearColor NoticeBack{ 0.0f, 0.0f, 0.0f, 0.65f };
		FLinearColor ButtonNormal{ 0.82f, 0.80f, 0.74f, 1.0f };
		FLinearColor ButtonHovered{ 0.95f, 0.92f, 0.84f, 1.0f };
		FLinearColor ButtonPressed{ 0.62f, 0.60f, 0.55f, 1.0f };
		FLinearColor ButtonDisabled{ 0.40f, 0.40f, 0.40f, 1.0f };
		FLinearColor ButtonText{ 0.05f, 0.05f, 0.05f, 1.0f };
		/** 체력·마나 바의 채움과 바탕. */
		FLinearColor Hp{ 0.75f, 0.12f, 0.10f, 1.0f };
		FLinearColor Mp{ 0.15f, 0.35f, 0.85f, 1.0f };
		FLinearColor Exp{ 0.55f, 0.75f, 0.2f, 1.0f };
		FLinearColor BarBack{ 0.0f, 0.0f, 0.0f, 0.6f };
		/** 진행 바(시전 등)의 채움, 상태 이상과 효과의 글자 아이콘, 퀵슬롯의 쿨다운 가림. */
		FLinearColor Cast{ 0.95f, 0.75f, 0.2f, 1.0f };
		FLinearColor Status{ 1.0f, 0.6f, 0.3f, 1.0f };
		FLinearColor CooldownShade{ 0.0f, 0.0f, 0.0f, 0.65f };
		/** 고른 버튼(캐릭터 칸, 직업)의 배경 곱. */
		FLinearColor Selected{ 1.0f, 0.78f, 0.3f, 1.0f };
		/** 채팅의 줄 색(주변, 파티, 전체, 귓속말, 시스템. 41)과 채팅창·말풍선의 바탕. */
		FLinearColor ChatNearby{ 0.92f, 0.92f, 0.90f, 1.0f };
		FLinearColor ChatParty{ 0.45f, 0.75f, 1.0f, 1.0f };
		FLinearColor ChatWorld{ 1.0f, 0.75f, 0.45f, 1.0f };
		FLinearColor ChatWhisper{ 1.0f, 0.55f, 0.9f, 1.0f };
		FLinearColor ChatSystem{ 0.95f, 0.85f, 0.3f, 1.0f };
		FLinearColor ChatBack{ 0.0f, 0.0f, 0.0f, 0.45f };

		int32 TitleSize = 24;
		int32 BodySize = 18;
		int32 SmallSize = 14;
		int32 KeySize = 11;
		int32 ValueSize = 32;

		/** 버튼의 최소 높이. 터치는 손가락으로 누를 크기(약 9 mm)를 겨냥한 값이고, 실제 휴대폰에서 재서 정한다(재지 않았습니다). */
		float ButtonHeightTouch = 120.0f;
		float ButtonHeightPointer = 44.0f;
		float ButtonRadius = 6.0f;
		FMargin ButtonPadding{ 16.0f, 6.0f };

		float PanelRadius = 10.0f;
		float PanelPadding = 24.0f;
		/** 세로로 쌓은 것 사이와 나란한 버튼 사이. */
		float Gap = 8.0f;
		float Section = 16.0f;
		/** 창의 폭(좁은 창, 넓은 창). 창은 가운데에 이 폭으로 둔다. */
		float WindowNarrow = 360.0f;
		float WindowWide = 440.0f;
		/** 아이템 칸 한 변(32). */
		float ItemSlot = 64.0f;
		/** HUD의 요소가 화면 모서리(안전 영역 안)에서 떨어지는 거리. */
		float HudMargin = 24.0f;
		float JoystickSize = 240.0f;
		/** HUD의 체력·마나 바 크기. */
		float BarWidth = 320.0f;
		float BarHeight = 24.0f;
		/** 이름표의 체력 바 크기. */
		float TagBarWidth = 80.0f;
		float TagBarHeight = 6.0f;
		/** 퀵슬롯 한 칸의 폭. */
		float SlotWidth = 80.0f;
		float NoticeTop = 80.0f;
		/** 채팅창의 폭, 줄 목록의 높이, 받는 사람 칸의 폭(41). 말풍선의 가장 넓은 폭. */
		float ChatWidth = 440.0f;
		float ChatLinesHeight = 180.0f;
		float ChatToWidth = 110.0f;
		float BubbleWidth = 240.0f;
		/** HUD의 파티 칸이 왼쪽 위에서 내려오는 거리(구역 표시 아래)와 파티원 칸의 폭(42). */
		float PartyTop = 190.0f;
		float PartySlotWidth = 180.0f;
	};

	const FMmoStyle Style;

	/** 위젯 블루프린트 하나를 만드는 동안의 상태. 디스크의 옛 파일을 지우고 새로 만든다. */
	class FWidgetBlueprintBuilder
	{
	public:
		FWidgetBlueprintBuilder(const TCHAR* InPackageName, UClass* ParentClass)
			: PackageName(InPackageName)
			, Filename(FPackageName::LongPackageNameToFilename(PackageName, FPackageName::GetAssetPackageExtension()))
		{
			IFileManager::Get().Delete(*Filename, false, true, true);
			UPackage* Package = CreatePackage(*PackageName);
			const FName Name(*FPackageName::GetShortName(PackageName));
			// 이 프로세스에서 이미 불러온 옛 위젯 블루프린트가 있으면 이름을 비켜 준다.
			if (UObject* Old = StaticFindObject(nullptr, Package, *Name.ToString()))
			{
				Old->Rename(nullptr, GetTransientPackage(), REN_DontCreateRedirectors | REN_NonTransactional);
			}
			Blueprint = CastChecked<UWidgetBlueprint>(FKismetEditorUtilities::CreateBlueprint(
				ParentClass, Package, Name, BPTYPE_Normal, UWidgetBlueprint::StaticClass(), UWidgetBlueprintGeneratedClass::StaticClass()));
		}

		/** 위젯을 만든다. bBound면 기반 클래스의 BindWidget에 묶일 변수다. */
		template <typename T>
		T* Add(const TCHAR* Name, bool bBound = false)
		{
			return Add<T>(T::StaticClass(), Name, bBound);
		}

		template <typename T>
		T* Add(UClass* Class, const TCHAR* Name, bool bBound = false)
		{
			T* Widget = Blueprint->WidgetTree->ConstructWidget<T>(Class, Name);
			Widget->bIsVariable = bBound;
			return Widget;
		}

		/** 스타일 표의 글자색과 그림자로 글을 만든다. 코드가 채우는 글(상태 줄 등)이다. */
		UTextBlock* Text(const TCHAR* Name, const FText& Value, int32 Size, bool bBound = false, const FLinearColor& Color = Style.Text)
		{
			UTextBlock* Block = Add<UTextBlock>(Name, bBound);
			StyleText(*Block, Value, Size, Color);
			return Block;
		}

		/** 고정된 글: Strings의 키를 가진 글 상자(실행 중에 그 언어의 문장으로 채움. 디자인 화면에서는 키가 보임). */
		UMmoTextBlock* KeyText(const TCHAR* Name, const TCHAR* Key, int32 Size, bool bBound = false, const FLinearColor& Color = Style.Text)
		{
			UMmoTextBlock* Block = Add<UMmoTextBlock>(Name, bBound);
			Block->TextKey = Key;
			StyleText(*Block, FText::FromString(Key), Size, Color);
			return Block;
		}

		void StyleText(UTextBlock& Block, const FText& Value, int32 Size, const FLinearColor& Color)
		{
			Block.SetText(Value);
			FSlateFontInfo Font = Block.GetFont();
			Font.Size = Size;
			Block.SetFont(Font);
			Block.SetColorAndOpacity(FSlateColor(Color));
			Block.SetShadowOffset(FVector2D(1.0, 1.0));
			Block.SetShadowColorAndOpacity(Style.Shadow);
		}

		/** 라벨이 Strings의 키인 공용 버튼(실행 중에 그 언어의 문장으로 채움). */
		UMmoButtonWidget* Button(const TCHAR* Name, const TCHAR* LabelKey, bool bTouchOnly = false)
		{
			UMmoButtonWidget* Result = Button(Name, FText::FromString(LabelKey), bTouchOnly);
			Result->LabelKey = LabelKey;
			return Result;
		}

		/** 공용 버튼(WBP_Button)을 놓는다. 이름이 기반 클래스의 BindWidget과 같아야 한다. 라벨은 코드가 채우거나(빈 글) 언어와 상관없는 기호다. */
		UMmoButtonWidget* Button(const TCHAR* Name, const FText& Label, bool bTouchOnly = false)
		{
			UMmoButtonWidget* Result = Add<UMmoButtonWidget>(ButtonClass, Name, true);
			Result->Label = Label;
			Result->bTouchOnly = bTouchOnly;
			Result->MinHeightTouch = Style.ButtonHeightTouch;
			Result->MinHeightPointer = Style.ButtonHeightPointer;
			Result->SelectedTint = Style.Selected;
			Result->IconLetterSize = Style.TitleSize;
			return Result;
		}

		/**
		 * 창과 팝업: 화면 전체를 덮는 바탕(Backdrop 또는 Dim) 위, 안전 영역 안의 가운데에 폭 Width의 판을 둔다. 판 안의 세로 상자를 낸다.
		 * 화면의 비율이 달라도 창은 가운데에 같은 폭으로 있다.
		 */
		UVerticalBox* Window(float Width, const FLinearColor& Back)
		{
			UBorder* Root = Add<UBorder>(TEXT("Back"));
			Root->SetBrushColor(Back);
			Root->SetPadding(FMargin(0.0f));
			Blueprint->WidgetTree->RootWidget = Root;
			USafeZone* Safe = Add<USafeZone>(TEXT("Safe"));
			Root->SetContent(Safe);

			USizeBox* Size = Add<USizeBox>(TEXT("PanelSize"));
			Size->SetWidthOverride(Width);
			USafeZoneSlot* SizeSlot = Cast<USafeZoneSlot>(Safe->AddChild(Size));
			SizeSlot->SetHorizontalAlignment(HAlign_Center);
			SizeSlot->SetVerticalAlignment(VAlign_Center);

			UBorder* Panel = Add<UBorder>(TEXT("Panel"));
			Panel->SetBrush(FSlateRoundedBoxBrush(Style.Panel, Style.PanelRadius));
			Panel->SetPadding(FMargin(Style.PanelPadding));
			Size->SetContent(Panel);
			UVerticalBox* Column = Add<UVerticalBox>(TEXT("Column"));
			Panel->SetContent(Column);
			return Column;
		}

		/** HUD 같은 층: 안전 영역 안을 채우는 캔버스. 요소는 Corner로 가까운 모서리에 붙인다. 입력은 자식만 받는다. */
		UCanvasPanel* SafeCanvas()
		{
			USafeZone* Safe = Add<USafeZone>(TEXT("Safe"));
			Safe->SetVisibility(ESlateVisibility::SelfHitTestInvisible);
			Blueprint->WidgetTree->RootWidget = Safe;
			UCanvasPanel* Canvas = Add<UCanvasPanel>(TEXT("Root"));
			Canvas->SetVisibility(ESlateVisibility::SelfHitTestInvisible);
			Safe->AddChild(Canvas);
			return Canvas;
		}

		void SetRoot(UWidget* Root)
		{
			Blueprint->WidgetTree->RootWidget = Root;
		}

		/** 컴파일해 저장한다. BindWidget 이름이 어긋나면 컴파일 오류로 실패한다. */
		bool Save()
		{
			FKismetEditorUtilities::CompileBlueprint(Blueprint);
			if (Blueprint->Status == BS_Error)
			{
				UE_LOG(LogMmoCreateWidgets, Error, TEXT("%s did not compile."), *PackageName);
				return false;
			}
			FAssetRegistryModule::AssetCreated(Blueprint);
			FSavePackageArgs Args;
			Args.TopLevelFlags = RF_Public | RF_Standalone;
			if (!UPackage::SavePackage(Blueprint->GetPackage(), Blueprint, *Filename, Args))
			{
				UE_LOG(LogMmoCreateWidgets, Error, TEXT("Could not save %s."), *Filename);
				return false;
			}
			UE_LOG(LogMmoCreateWidgets, Display, TEXT("Created %s"), *PackageName);
			return true;
		}

		UClass* GeneratedClass() const
		{
			return Blueprint->GeneratedClass;
		}

		/** 공용 버튼의 클래스. CreateButton이 맨 먼저 정한다. */
		static inline UClass* ButtonClass = nullptr;

	private:
		FString PackageName;
		FString Filename;
		UWidgetBlueprint* Blueprint = nullptr;
	};

	enum class ECorner
	{
		TopLeft,
		TopRight,
		BottomLeft,
		BottomRight,
		/** 위 가운데(대상 정보). */
		TopCenter,
		/** 아래 가운데(퀵슬롯과 진행 바). */
		BottomCenter,
	};

	/**
	 * HUD의 요소를 가까운 모서리에 붙인다(앵커와 정렬을 그 모서리로). Offset은 모서리에서 안쪽으로의 거리다(스타일 표의 HudMargin부터).
	 * 화면의 비율이 16:9에서 21:9로 넓어져도 요소는 모서리를 따라간다.
	 */
	UCanvasPanelSlot* Corner(UCanvasPanel& Canvas, UWidget* Widget, ECorner Where, FVector2D Offset = FVector2D(Style.HudMargin, Style.HudMargin))
	{
		const bool bRight = Where == ECorner::TopRight || Where == ECorner::BottomRight;
		const bool bBottom = Where == ECorner::BottomLeft || Where == ECorner::BottomRight || Where == ECorner::BottomCenter;
		const bool bCenter = Where == ECorner::TopCenter || Where == ECorner::BottomCenter;
		const float Horizontal = bCenter ? 0.5f : (bRight ? 1.0f : 0.0f);
		UCanvasPanelSlot* Slot = Canvas.AddChildToCanvas(Widget);
		Slot->SetAnchors(FAnchors(Horizontal, bBottom ? 1.0f : 0.0f));
		Slot->SetAlignment(FVector2D(Horizontal, bBottom ? 1.0 : 0.0));
		Slot->SetPosition(FVector2D(bCenter ? 0.0 : (bRight ? -Offset.X : Offset.X), bBottom ? -Offset.Y : Offset.Y));
		Slot->SetAutoSize(true);
		return Slot;
	}

	void AddWithGap(UVerticalBox& Column, UWidget* Child, float Bottom = Style.Gap)
	{
		Column.AddChildToVerticalBox(Child)->SetPadding(FMargin(0.0f, 0.0f, 0.0f, Bottom));
	}

	/** 버튼들을 사이를 두고 나란히 둔다. */
	UHorizontalBox* Row(FWidgetBlueprintBuilder& Builder, const TCHAR* Name, std::initializer_list<UWidget*> Children)
	{
		UHorizontalBox* Result = Builder.Add<UHorizontalBox>(Name);
		int32 Index = 0;
		for (UWidget* Child : Children)
		{
			Result->AddChildToHorizontalBox(Child)->SetPadding(FMargin(Index++ == 0 ? 0.0f : Style.Gap, 0.0f, 0.0f, 0.0f));
		}
		return Result;
	}

	/** 창의 아래에 오른쪽 정렬로 버튼 줄을 둔다. */
	void ButtonsAtEnd(UVerticalBox& Column, UHorizontalBox* Buttons)
	{
		Column.AddChildToVerticalBox(Buttons)->SetHorizontalAlignment(HAlign_Right);
	}

	FSlateBrush RoundedButtonBrush(const FLinearColor& Color)
	{
		return FSlateRoundedBoxBrush(Color, Style.ButtonRadius);
	}

	/** 공용 버튼(WBP_Button). 다른 화면이 모두 이것을 놓으므로 맨 먼저 만든다. */
	UClass* CreateButton()
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::Button, UMmoButtonWidget::StaticClass());
		USizeBox* Size = Builder.Add<USizeBox>(TEXT("Size"), true);
		Builder.SetRoot(Size);
		UButton* Button = Builder.Add<UButton>(TEXT("Button"), true);
		FButtonStyle ButtonStyle = Button->GetStyle();
		ButtonStyle.SetNormal(RoundedButtonBrush(Style.ButtonNormal));
		ButtonStyle.SetHovered(RoundedButtonBrush(Style.ButtonHovered));
		ButtonStyle.SetPressed(RoundedButtonBrush(Style.ButtonPressed));
		ButtonStyle.SetDisabled(RoundedButtonBrush(Style.ButtonDisabled));
		ButtonStyle.SetNormalPadding(FMargin(0.0f));
		ButtonStyle.SetPressedPadding(FMargin(0.0f));
		Button->SetStyle(ButtonStyle);
		Size->SetContent(Button);

		// 아이콘의 그림은 칸을 채우고(SetIcon 전에는 감춤), 글은 가운데, 키 표시는 오른쪽 위 구석.
		UOverlay* Stack = Builder.Add<UOverlay>(TEXT("Stack"));
		UButtonSlot* StackSlot = Cast<UButtonSlot>(Button->AddChild(Stack));
		StackSlot->SetPadding(Style.ButtonPadding);
		StackSlot->SetHorizontalAlignment(HAlign_Fill);
		StackSlot->SetVerticalAlignment(VAlign_Fill);
		UImage* Icon = Builder.Add<UImage>(TEXT("IconImage"), true);
		Icon->SetVisibility(ESlateVisibility::Collapsed);
		UOverlaySlot* IconSlot = Stack->AddChildToOverlay(Icon);
		IconSlot->SetHorizontalAlignment(HAlign_Fill);
		IconSlot->SetVerticalAlignment(VAlign_Fill);
		UTextBlock* Label = Builder.Text(TEXT("LabelText"), FText::GetEmpty(), Style.BodySize, true, Style.ButtonText);
		Label->SetShadowOffset(FVector2D::ZeroVector);
		UOverlaySlot* LabelSlot = Stack->AddChildToOverlay(Label);
		LabelSlot->SetHorizontalAlignment(HAlign_Center);
		LabelSlot->SetVerticalAlignment(VAlign_Center);
		UTextBlock* Key = Builder.Text(TEXT("KeyText"), FText::GetEmpty(), Style.KeySize, true, Style.ButtonText);
		Key->SetShadowOffset(FVector2D::ZeroVector);
		UOverlaySlot* KeySlot = Stack->AddChildToOverlay(Key);
		KeySlot->SetHorizontalAlignment(HAlign_Right);
		KeySlot->SetVerticalAlignment(VAlign_Top);
		return Builder.Save() ? Builder.GeneratedClass() : nullptr;
	}

	bool CreateLogin()
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::Login, UMmoLoginWidget::StaticClass());
		UVerticalBox* Column = Builder.Window(Style.WindowNarrow, Style.Backdrop);
		AddWithGap(*Column, Builder.Text(TEXT("Title"), FText::AsCultureInvariant(TEXT("PortfolioMmo")), Style.TitleSize + 4), Style.Section);
		UEditableTextBox* LoginIdBox = Builder.Add<UEditableTextBox>(TEXT("LoginIdBox"), true);
		LoginIdBox->SetHintText(FText::FromString(TEXT("login.idHint")));
		AddWithGap(*Column, LoginIdBox);
		AddWithGap(*Column, Builder.Button(TEXT("LogInButton"), TEXT("login.logIn")));
		UTextBlock* Status = Builder.Text(TEXT("StatusText"), FText::GetEmpty(), Style.SmallSize + 2, true);
		Status->SetAutoWrapText(true);
		Column->AddChildToVerticalBox(Status);
		return Builder.Save();
	}

	/** 조이스틱을 만들고 그 클래스를 낸다(HUD가 담는다). 실패하면 nullptr. */
	UClass* CreateJoystick()
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::Joystick, UMmoJoystickWidget::StaticClass());
		USizeBox* Root = Builder.Add<USizeBox>(TEXT("Root"));
		Root->SetWidthOverride(Style.JoystickSize);
		Root->SetHeightOverride(Style.JoystickSize);
		Builder.SetRoot(Root);
		UOverlay* Stack = Builder.Add<UOverlay>(TEXT("Stack"));
		Root->SetContent(Stack);

		// 엔진의 모바일 HUD 텍스처다. 이 위젯 블루프린트가 참조하므로 함께 쿠킹된다.
		UImage* Base = Builder.Add<UImage>(TEXT("Base"));
		Base->SetBrushFromTexture(LoadObject<UTexture2D>(nullptr, TEXT("/Engine/MobileResources/HUD/VirtualJoystick_Background.VirtualJoystick_Background")));
		UOverlaySlot* BaseSlot = Stack->AddChildToOverlay(Base);
		BaseSlot->SetHorizontalAlignment(HAlign_Fill);
		BaseSlot->SetVerticalAlignment(VAlign_Fill);

		UImage* Thumb = Builder.Add<UImage>(TEXT("Thumb"), true);
		Thumb->SetBrushFromTexture(LoadObject<UTexture2D>(nullptr, TEXT("/Engine/MobileResources/HUD/VirtualJoystick_Thumb.VirtualJoystick_Thumb")));
		Thumb->SetDesiredSizeOverride(FVector2D(Style.JoystickSize * 0.42, Style.JoystickSize * 0.42));
		UOverlaySlot* ThumbSlot = Stack->AddChildToOverlay(Thumb);
		ThumbSlot->SetHorizontalAlignment(HAlign_Center);
		ThumbSlot->SetVerticalAlignment(VAlign_Center);
		return Builder.Save() ? Builder.GeneratedClass() : nullptr;
	}

	/** 체력·마나 바 하나: 둥근 바탕 위의 채움(<Name>Bar)과 가운데의 "지금 / 최대"(<Name>Text). 값은 UMmoHudWidget이 넣는다. Text가 거짓이면 글 없이 바만. */
	UWidget* Bar(FWidgetBlueprintBuilder& Builder, const TCHAR* Name, const FLinearColor& Fill, float Width = Style.BarWidth, float Height = Style.BarHeight, bool bText = true)
	{
		USizeBox* Size = Builder.Add<USizeBox>(*FString::Printf(TEXT("%sBarSize"), Name));
		Size->SetWidthOverride(Width);
		Size->SetHeightOverride(Height);
		UOverlay* Stack = Builder.Add<UOverlay>(*FString::Printf(TEXT("%sBarStack"), Name));
		Size->SetContent(Stack);

		UProgressBar* Progress = Builder.Add<UProgressBar>(*FString::Printf(TEXT("%sBar"), Name), true);
		FProgressBarStyle BarStyle = Progress->GetWidgetStyle();
		BarStyle.BackgroundImage = FSlateRoundedBoxBrush(Style.BarBack, Style.ButtonRadius);
		BarStyle.FillImage = FSlateRoundedBoxBrush(FLinearColor::White, Style.ButtonRadius);
		Progress->SetWidgetStyle(BarStyle);
		Progress->SetFillColorAndOpacity(Fill);
		Progress->SetPercent(1.0f);
		UOverlaySlot* BarSlot = Stack->AddChildToOverlay(Progress);
		BarSlot->SetHorizontalAlignment(HAlign_Fill);
		BarSlot->SetVerticalAlignment(VAlign_Fill);

		if (!bText)
		{
			return Size;
		}
		UTextBlock* Value = Builder.Text(*FString::Printf(TEXT("%sText"), Name), FText::GetEmpty(), Style.SmallSize, true);
		UOverlaySlot* ValueSlot = Stack->AddChildToOverlay(Value);
		ValueSlot->SetHorizontalAlignment(HAlign_Center);
		ValueSlot->SetVerticalAlignment(VAlign_Center);
		return Size;
	}

	/**
	 * 채팅창(41): 반투명한 바탕 위에 줄 목록(스크롤)과 그 아래 채널 버튼, 받는 사람 칸(귓속말만), 입력 칸, 보내기 버튼. HUD가 담는다.
	 * 줄의 색과 크기는 HUD가 놓을 때 정한다(UMmoChatWidget의 KindColors, LineSize).
	 */
	UClass* CreateChat()
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::Chat, UMmoChatWidget::StaticClass());
		USizeBox* Size = Builder.Add<USizeBox>(TEXT("Size"));
		Size->SetWidthOverride(Style.ChatWidth);
		Builder.SetRoot(Size);
		UBorder* Back = Builder.Add<UBorder>(TEXT("Back"));
		Back->SetBrush(FSlateRoundedBoxBrush(Style.ChatBack, Style.ButtonRadius));
		Back->SetPadding(FMargin(Style.Gap));
		Size->SetContent(Back);
		UVerticalBox* Column = Builder.Add<UVerticalBox>(TEXT("Column"));
		Back->SetContent(Column);
		USizeBox* LinesSize = Builder.Add<USizeBox>(TEXT("LinesSize"));
		LinesSize->SetHeightOverride(Style.ChatLinesHeight);
		LinesSize->SetContent(Builder.Add<UScrollBox>(TEXT("LinesBox"), true));
		AddWithGap(*Column, LinesSize);
		UHorizontalBox* Input = Builder.Add<UHorizontalBox>(TEXT("Input"));
		Input->AddChildToHorizontalBox(Builder.Button(TEXT("ChannelButton"), FText::GetEmpty()));
		USizeBox* ToSize = Builder.Add<USizeBox>(TEXT("ToSize"));
		ToSize->SetWidthOverride(Style.ChatToWidth);
		UEditableTextBox* To = Builder.Add<UEditableTextBox>(TEXT("ToBox"), true);
		To->SetHintText(FText::FromString(TEXT("chat.to")));
		ToSize->SetContent(To);
		UHorizontalBoxSlot* ToSlot = Input->AddChildToHorizontalBox(ToSize);
		ToSlot->SetPadding(FMargin(Style.Gap * 0.5f, 0.0f, 0.0f, 0.0f));
		ToSlot->SetVerticalAlignment(VAlign_Center);
		UEditableTextBox* Line = Builder.Add<UEditableTextBox>(TEXT("InputBox"), true);
		Line->SetHintText(FText::FromString(TEXT("chat.hint")));
		UHorizontalBoxSlot* LineSlot = Input->AddChildToHorizontalBox(Line);
		LineSlot->SetSize(FSlateChildSize(ESlateSizeRule::Fill));
		LineSlot->SetPadding(FMargin(Style.Gap * 0.5f, 0.0f));
		LineSlot->SetVerticalAlignment(VAlign_Center);
		Input->AddChildToHorizontalBox(Builder.Button(TEXT("SendButton"), TEXT("chat.send")));
		Column->AddChildToVerticalBox(Input);
		return Builder.Save() ? Builder.GeneratedClass() : nullptr;
	}

	bool CreateHud(UClass* JoystickClass, UClass* ChatClass)
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::Hud, UMmoHudWidget::StaticClass());
		UCanvasPanel* Root = Builder.SafeCanvas();

		// 채팅창(41)은 왼쪽 아래, 터치 기기에서는 조이스틱 위다(PC에서는 UMmoHudWidget이 조이스틱 자리로 내림).
		UMmoChatWidget* Chat = Builder.Add<UMmoChatWidget>(ChatClass, TEXT("ChatBox"), true);
		Chat->KindColors = { Style.ChatNearby, Style.ChatParty, Style.ChatWorld, Style.ChatWhisper, Style.ChatSystem };
		Chat->LineSize = Style.SmallSize;
		Corner(*Root, Chat, ECorner::BottomLeft, FVector2D(Style.HudMargin, Style.HudMargin * 2.5 + Style.JoystickSize + Style.Gap));

		// 조이스틱은 왼쪽 아래(터치 기기에서만 보임. UMmoHudWidget).
		Corner(*Root, Builder.Add<UUserWidget>(JoystickClass, TEXT("Joystick"), true), ECorner::BottomLeft,
			FVector2D(Style.HudMargin * 2.5, Style.HudMargin * 2.5));

		// 왼쪽 위에 내 체력·마나·경험치 바, 그 아래 지금 구역(이름과 권장 레벨)과 안전 지대 표시.
		UVerticalBox* Zone = Builder.Add<UVerticalBox>(TEXT("Zone"));
		Zone->SetVisibility(ESlateVisibility::HitTestInvisible);
		Corner(*Root, Zone, ECorner::TopLeft);
		Zone->AddChildToVerticalBox(Bar(Builder, TEXT("Hp"), Style.Hp));
		Zone->AddChildToVerticalBox(Bar(Builder, TEXT("Mp"), Style.Mp))->SetPadding(FMargin(0.0f, Style.Gap * 0.5f, 0.0f, 0.0f));
		Zone->AddChildToVerticalBox(Bar(Builder, TEXT("Exp"), Style.Exp))->SetPadding(FMargin(0.0f, Style.Gap * 0.5f, 0.0f, Style.Gap));
		Zone->AddChildToVerticalBox(Builder.Text(TEXT("ZoneText"), FText::GetEmpty(), Style.BodySize, true));
		UMmoTextBlock* SafeZoneText = Builder.KeyText(TEXT("SafeZoneText"), TEXT("hud.safeZone"), Style.SmallSize, true, Style.Positive);
		SafeZoneText->SetVisibility(ESlateVisibility::Collapsed);
		Zone->AddChildToVerticalBox(SafeZoneText);
		// 걸린 효과와 전투 상태의 글자 아이콘과 남은 시간(아이콘 표는 73).
		Zone->AddChildToVerticalBox(Builder.Text(TEXT("EffectsText"), FText::GetEmpty(), Style.SmallSize, true, Style.Status));

		// 위 가운데에 내 대상의 정보(이름과 레벨, 체력 바). 대상이 없으면 UMmoHudWidget이 감춘다.
		UVerticalBox* Target = Builder.Add<UVerticalBox>(TEXT("TargetPanel"), true);
		Target->SetVisibility(ESlateVisibility::Collapsed);
		Corner(*Root, Target, ECorner::TopCenter);
		UTextBlock* TargetName = Builder.Text(TEXT("TargetNameText"), FText::GetEmpty(), Style.BodySize, true);
		Target->AddChildToVerticalBox(TargetName)->SetHorizontalAlignment(HAlign_Center);
		Target->AddChildToVerticalBox(Bar(Builder, TEXT("TargetHp"), Style.Hp))->SetPadding(FMargin(0.0f, Style.Gap * 0.5f, 0.0f, 0.0f));
		// 대상이 다른 플레이어면 귓속말 버튼(41)과 파티 초대 버튼(42). 보이는지는 UMmoHudWidget이 정한다.
		UMmoButtonWidget* Whisper = Builder.Button(TEXT("WhisperButton"), TEXT("target.whisper"));
		Whisper->SetVisibility(ESlateVisibility::Collapsed);
		UMmoButtonWidget* PartyInvite = Builder.Button(TEXT("PartyInviteButton"), TEXT("party.invite"));
		PartyInvite->SetVisibility(ESlateVisibility::Collapsed);
		Target->AddChildToVerticalBox(Row(Builder, TEXT("TargetButtons"), { Whisper, PartyInvite }))->SetHorizontalAlignment(HAlign_Center);

		// 왼쪽, 구역 표시 아래에 파티 버튼과 파티원 칸(42. 칸마다 이름 버튼과 작은 체력 바. 파티원이 없는 칸은 UMmoHudWidget이 감춤).
		UVerticalBox* Party = Builder.Add<UVerticalBox>(TEXT("Party"));
		Party->SetVisibility(ESlateVisibility::SelfHitTestInvisible);
		Corner(*Root, Party, ECorner::TopLeft, FVector2D(Style.HudMargin, Style.HudMargin + Style.PartyTop));
		AddWithGap(*Party, Builder.Button(TEXT("PartyButton"), TEXT("party.button")));
		Cast<UVerticalBoxSlot>(Party->GetChildAt(0)->Slot)->SetHorizontalAlignment(HAlign_Left);
		for (int32 Index = 0; Index < UMmoHudWidget::PartySlotCount(); ++Index)
		{
			UVerticalBox* Member = Builder.Add<UVerticalBox>(*FString::Printf(TEXT("PartyMember%dBox"), Index));
			Member->SetVisibility(ESlateVisibility::Collapsed);
			USizeBox* MemberSize = Builder.Add<USizeBox>(*FString::Printf(TEXT("PartyMember%dSize"), Index));
			MemberSize->SetWidthOverride(Style.PartySlotWidth);
			MemberSize->SetContent(Builder.Button(*FString::Printf(TEXT("PartyMember%d"), Index), FText::GetEmpty()));
			Member->AddChildToVerticalBox(MemberSize);
			Member->AddChildToVerticalBox(Bar(Builder, *FString::Printf(TEXT("PartyMember%dHp"), Index), Style.Hp, Style.PartySlotWidth, Style.TagBarHeight, false))
				->SetPadding(FMargin(0.0f, 2.0f, 0.0f, 0.0f));
			AddWithGap(*Party, Member);
		}

		// 아래 가운데에 내 진행 바(시전. 진행 중일 때만 보임)와 퀵슬롯 8칸(칸마다 버튼 위에 쿨다운 가림). 칸은 UMmoHudWidget이 이름(Slot<n>)으로 찾는다.
		UVerticalBox* Actions = Builder.Add<UVerticalBox>(TEXT("Actions"));
		Corner(*Root, Actions, ECorner::BottomCenter);
		UVerticalBox* CastPanel = Builder.Add<UVerticalBox>(TEXT("CastPanel"), true);
		CastPanel->SetVisibility(ESlateVisibility::Collapsed);
		CastPanel->AddChildToVerticalBox(Bar(Builder, TEXT("Cast"), Style.Cast));
		Actions->AddChildToVerticalBox(CastPanel)->SetHorizontalAlignment(HAlign_Center);
		UHorizontalBox* Slots = Builder.Add<UHorizontalBox>(TEXT("Slots"));
		Actions->AddChildToVerticalBox(Slots)->SetPadding(FMargin(0.0f, Style.Gap, 0.0f, 0.0f));
		for (int32 Index = 0; Index < UMmoHudWidget::QuickslotCount(); ++Index)
		{
			USizeBox* Size = Builder.Add<USizeBox>(*FString::Printf(TEXT("Slot%dSize"), Index));
			Size->SetWidthOverride(Style.SlotWidth);
			UOverlay* Stack = Builder.Add<UOverlay>(*FString::Printf(TEXT("Slot%dStack"), Index));
			Size->SetContent(Stack);
			UOverlaySlot* ButtonSlot = Stack->AddChildToOverlay(Builder.Button(*FString::Printf(TEXT("Slot%d"), Index), FText::GetEmpty()));
			ButtonSlot->SetHorizontalAlignment(HAlign_Fill);
			UProgressBar* Shade = Builder.Add<UProgressBar>(*FString::Printf(TEXT("Slot%dCooldown"), Index));
			FProgressBarStyle ShadeStyle = Shade->GetWidgetStyle();
			ShadeStyle.BackgroundImage = FSlateNoResource();
			ShadeStyle.FillImage = FSlateRoundedBoxBrush(FLinearColor::White, Style.ButtonRadius);
			Shade->SetWidgetStyle(ShadeStyle);
			Shade->SetFillColorAndOpacity(Style.CooldownShade);
			Shade->SetBarFillType(EProgressBarFillType::BottomToTop);
			Shade->SetPercent(0.0f);
			Shade->SetVisibility(ESlateVisibility::HitTestInvisible);
			UOverlaySlot* ShadeSlot = Stack->AddChildToOverlay(Shade);
			ShadeSlot->SetHorizontalAlignment(HAlign_Fill);
			ShadeSlot->SetVerticalAlignment(VAlign_Fill);
			Slots->AddChildToHorizontalBox(Size)->SetPadding(FMargin(Index == 0 ? 0.0f : Style.Gap * 0.5f, 0.0f, 0.0f, 0.0f));
		}

		// 오른쪽 아래에 자동 사냥 버튼(PC와 터치 기기 모두. Z, 40)과 터치 기기에서만 보이는 상호작용, 대상 고르기, 공격 버튼. PC에서는 E, Tab, F가 같은 일을 한다.
		Corner(*Root, Row(Builder, TEXT("TouchButtons"), {
			Builder.Button(TEXT("AutoButton"), TEXT("hud.auto")),
			Builder.Button(TEXT("InteractButton"), TEXT("interact.none"), true),
			Builder.Button(TEXT("TargetButton"), TEXT("hud.target"), true),
			Builder.Button(TEXT("AttackButton"), TEXT("hud.attack"), true),
		}), ECorner::BottomRight, FVector2D(Style.HudMargin * 2.5, Style.HudMargin * 2.5));

		// 오른쪽 위에 메뉴 버튼(PC와 터치 기기 모두. 키 표시와 누를 수 있는지는 UMmoHudWidget이 정함), 그 아래 시연 표시(설정 창에서 켬).
		UVerticalBox* TopRight = Builder.Add<UVerticalBox>(TEXT("TopRight"));
		Corner(*Root, TopRight, ECorner::TopRight);
		UTextBlock* Stats = Builder.Text(TEXT("StatsText"), FText::GetEmpty(), Style.SmallSize, true);
		Stats->SetVisibility(ESlateVisibility::Collapsed);
		TopRight->AddChildToVerticalBox(Row(Builder, TEXT("MenuButtons"), {
			Builder.Button(TEXT("BagButton"), TEXT("menu.bag")),
			Builder.Button(TEXT("CharacterButton"), TEXT("menu.character")),
			Builder.Button(TEXT("SkillsButton"), TEXT("menu.skills")),
			Builder.Button(TEXT("QuestButton"), TEXT("menu.quest")),
			Builder.Button(TEXT("SettingsButton"), TEXT("menu.settings")),
		}));
		// 미니맵(76): 투명한 버튼(누르면 지도) 안에 바탕 그림, 점의 캔버스, 가운데의 내 화살표.
		UButton* Minimap = Builder.Add<UButton>(TEXT("MinimapButton"), true);
		FButtonStyle Clear;
		Clear.SetNormal(FSlateNoResource());
		Clear.SetHovered(FSlateNoResource());
		Clear.SetPressed(FSlateNoResource());
		Clear.SetNormalPadding(FMargin(0.0f));
		Clear.SetPressedPadding(FMargin(0.0f));
		Minimap->SetStyle(Clear);
		USizeBox* MinimapSize = Builder.Add<USizeBox>(TEXT("MinimapSize"));
		MinimapSize->SetWidthOverride(UMmoHudWidget::MinimapSize);
		MinimapSize->SetHeightOverride(UMmoHudWidget::MinimapSize);
		Minimap->SetContent(MinimapSize);
		UOverlay* MinimapStack = Builder.Add<UOverlay>(TEXT("MinimapStack"));
		MinimapSize->SetContent(MinimapStack);
		UOverlaySlot* MinimapImageSlot = MinimapStack->AddChildToOverlay(Builder.Add<UImage>(TEXT("MinimapImage"), true));
		MinimapImageSlot->SetHorizontalAlignment(HAlign_Fill);
		MinimapImageSlot->SetVerticalAlignment(VAlign_Fill);
		UCanvasPanel* MinimapDots = Builder.Add<UCanvasPanel>(TEXT("MinimapDots"), true);
		MinimapDots->SetVisibility(ESlateVisibility::HitTestInvisible);
		UOverlaySlot* DotsSlot = MinimapStack->AddChildToOverlay(MinimapDots);
		DotsSlot->SetHorizontalAlignment(HAlign_Fill);
		DotsSlot->SetVerticalAlignment(VAlign_Fill);
		UTextBlock* Arrow = Builder.Text(TEXT("MinimapArrow"), FText::AsCultureInvariant(TEXT("▲")), Style.BodySize, true, Style.Cast);
		Arrow->SetRenderTransformPivot(FVector2D(0.5, 0.5));
		UOverlaySlot* ArrowSlot = MinimapStack->AddChildToOverlay(Arrow);
		ArrowSlot->SetHorizontalAlignment(HAlign_Center);
		ArrowSlot->SetVerticalAlignment(VAlign_Center);
		TopRight->AddChildToVerticalBox(Minimap)->SetPadding(FMargin(0.0f, Style.Gap, 0.0f, 0.0f));
		Cast<UVerticalBoxSlot>(Minimap->Slot)->SetHorizontalAlignment(HAlign_Right);
		TopRight->AddChildToVerticalBox(Stats)->SetHorizontalAlignment(HAlign_Right);
		return Builder.Save();
	}

	/** 알림: 위 가운데에 줄 넷(새 줄이 아래). 줄은 UMmoNoticeWidget이 보이고 감춘다. */
	bool CreateNotice()
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::Notice, UMmoNoticeWidget::StaticClass());
		USafeZone* Safe = Builder.Add<USafeZone>(TEXT("Safe"));
		Safe->SetVisibility(ESlateVisibility::HitTestInvisible);
		Builder.SetRoot(Safe);
		UVerticalBox* Lines = Builder.Add<UVerticalBox>(TEXT("Lines"));
		USafeZoneSlot* LinesSlot = Cast<USafeZoneSlot>(Safe->AddChild(Lines));
		LinesSlot->SetHorizontalAlignment(HAlign_Center);
		LinesSlot->SetVerticalAlignment(VAlign_Top);
		LinesSlot->SetPadding(FMargin(0.0f, Style.NoticeTop, 0.0f, 0.0f));
		for (int32 Index = 0; Index < UMmoNoticeWidget::MaxLines; ++Index)
		{
			UBorder* Line = Builder.Add<UBorder>(*FString::Printf(TEXT("Line%d"), Index), true);
			Line->SetBrush(FSlateRoundedBoxBrush(Style.NoticeBack, Style.ButtonRadius));
			Line->SetPadding(FMargin(16.0f, 8.0f));
			Line->SetContent(Builder.Text(*FString::Printf(TEXT("Line%dText"), Index), FText::GetEmpty(), Style.BodySize, true));
			UVerticalBoxSlot* LineSlot = Lines->AddChildToVerticalBox(Line);
			LineSlot->SetHorizontalAlignment(HAlign_Center);
			LineSlot->SetPadding(FMargin(0.0f, 0.0f, 0.0f, Style.Gap * 0.5f));
		}
		return Builder.Save();
	}

	bool CreateNameTag()
	{
		// 이름과 그 아래 작은 체력 바(플레이어와 몬스터만 보임. UMmoNameTagWidget).
		FWidgetBlueprintBuilder Builder(MmoUiPaths::NameTag, UMmoNameTagWidget::StaticClass());
		UVerticalBox* Column = Builder.Add<UVerticalBox>(TEXT("Column"));
		Column->SetVisibility(ESlateVisibility::HitTestInvisible);
		Builder.SetRoot(Column);
		// 맨 위에 주변 채팅의 말풍선(41. 채팅이 올 때만 보임).
		UBorder* Bubble = Builder.Add<UBorder>(TEXT("Bubble"), true);
		Bubble->SetBrush(FSlateRoundedBoxBrush(Style.NoticeBack, Style.ButtonRadius));
		Bubble->SetPadding(FMargin(10.0f, 6.0f));
		Bubble->SetVisibility(ESlateVisibility::Collapsed);
		// 자동 줄바꿈은 크기를 스스로 정하는 캔버스 칸에서 폭을 받지 못해 낱말마다 줄을 바꾸므로, 정한 폭에서 줄을 바꾼다.
		UTextBlock* BubbleText = Builder.Text(TEXT("BubbleText"), FText::GetEmpty(), Style.SmallSize, true);
		BubbleText->SetWrapTextAt(Style.BubbleWidth);
		Bubble->SetContent(BubbleText);
		Column->AddChildToVerticalBox(Bubble)->SetPadding(FMargin(0.0f, 0.0f, 0.0f, Style.Gap * 0.5f));
		Cast<UVerticalBoxSlot>(Bubble->Slot)->SetHorizontalAlignment(HAlign_Center);
		UTextBlock* Status = Builder.Text(TEXT("StatusText"), FText::GetEmpty(), Style.SmallSize, true, Style.Status);
		Status->SetVisibility(ESlateVisibility::Collapsed);
		Column->AddChildToVerticalBox(Status)->SetHorizontalAlignment(HAlign_Center);
		Column->AddChildToVerticalBox(Builder.Text(TEXT("NameText"), FText::GetEmpty(), Style.SmallSize, true))->SetHorizontalAlignment(HAlign_Center);
		Column->AddChildToVerticalBox(Bar(Builder, TEXT("Hp"), Style.Hp, Style.TagBarWidth, Style.TagBarHeight, false))->SetHorizontalAlignment(HAlign_Center);
		// 진행 바는 진행 중일 때만 보인다(UMmoNameTagWidget이 첫 프레임에 감춤).
		Column->AddChildToVerticalBox(Bar(Builder, TEXT("Progress"), Style.Cast, Style.TagBarWidth, Style.TagBarHeight, false))->SetHorizontalAlignment(HAlign_Center);
		return Builder.Save();
	}

	/** 사망 화면: 어두운 바탕 위 가운데 창에 제목과 부활 버튼. */
	bool CreateDeath()
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::Death, UMmoDeathWidget::StaticClass());
		UVerticalBox* Column = Builder.Window(Style.WindowNarrow, Style.Dim);
		AddWithGap(*Column, Builder.KeyText(TEXT("Title"), TEXT("death.title"), Style.TitleSize), Style.Section);
		Column->AddChildToVerticalBox(Builder.Button(TEXT("ReviveButton"), TEXT("death.revive")));
		return Builder.Save();
	}

	bool CreateSettings()
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::Settings, UMmoSettingsWidget::StaticClass());
		UVerticalBox* Column = Builder.Window(Style.WindowWide, Style.Dim);
		AddWithGap(*Column, Builder.KeyText(TEXT("Title"), TEXT("settings.title"), Style.TitleSize), Style.Section);
		// 기기에 남기는 설정의 줄(77)과 시연 표시(30)를 두 칸씩. 글(지금 값)은 기반 클래스가 채운다.
		const auto Pair = [&](const TCHAR* Name, const TCHAR* Left, const TCHAR* Right)
		{
			UHorizontalBox* Line = Builder.Add<UHorizontalBox>(Name);
			for (const TCHAR* Button : { Left, Right })
			{
				UHorizontalBoxSlot* Slot = Line->AddChildToHorizontalBox(Builder.Button(Button, FText::GetEmpty()));
				Slot->SetSize(FSlateChildSize(ESlateSizeRule::Fill));
				Slot->SetPadding(FMargin(Button == Left ? 0.0f : Style.Gap * 0.5f, 0.0f, Button == Left ? Style.Gap * 0.5f : 0.0f, 0.0f));
			}
			AddWithGap(*Column, Line);
		};
		Pair(TEXT("Volumes"), TEXT("EffectVolumeButton"), TEXT("MusicVolumeButton"));
		Pair(TEXT("Graphics"), TEXT("QualityButton"), TEXT("FrameButton"));
		Pair(TEXT("Options"), TEXT("LanguageButton"), TEXT("ShakeButton"));
		AddWithGap(*Column, Builder.Button(TEXT("StatsButton"), FText::GetEmpty()), Style.Section);
		AddWithGap(*Column, Builder.Button(TEXT("CharacterSelectButton"), TEXT("settings.characterSelect")));
		AddWithGap(*Column, Builder.Button(TEXT("LogOutButton"), TEXT("settings.logOut")));
		AddWithGap(*Column, Builder.Button(TEXT("QuitButton"), TEXT("settings.quit")));
		Column->AddChildToVerticalBox(Builder.Button(TEXT("CloseButton"), TEXT("common.close")));
		return Builder.Save();
	}

	/** 아이템 칸(32): 등급의 색 테두리 안에 아이콘(그림이나 글자)과 오른쪽 아래의 겹친 수. 목록 위젯의 항목이라 크기가 정해져 있다. */
	UClass* CreateItemSlot()
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::ItemSlot, UMmoItemSlotWidget::StaticClass());
		USizeBox* Size = Builder.Add<USizeBox>(TEXT("Size"));
		Size->SetWidthOverride(Style.ItemSlot);
		Size->SetHeightOverride(Style.ItemSlot);
		Builder.SetRoot(Size);
		UBorder* Grade = Builder.Add<UBorder>(TEXT("GradeBorder"), true);
		Grade->SetPadding(FMargin(2.0f));
		Size->SetContent(Grade);
		UBorder* Inner = Builder.Add<UBorder>(TEXT("Inner"));
		Inner->SetBrushColor(Style.BarBack);
		Grade->SetContent(Inner);
		UOverlay* Stack = Builder.Add<UOverlay>(TEXT("Stack"));
		Inner->SetContent(Stack);
		UImage* Icon = Builder.Add<UImage>(TEXT("IconImage"), true);
		Icon->SetVisibility(ESlateVisibility::Collapsed);
		UOverlaySlot* IconSlot = Stack->AddChildToOverlay(Icon);
		IconSlot->SetHorizontalAlignment(HAlign_Fill);
		IconSlot->SetVerticalAlignment(VAlign_Fill);
		UOverlaySlot* LetterSlot = Stack->AddChildToOverlay(Builder.Text(TEXT("LetterText"), FText::GetEmpty(), Style.TitleSize, true));
		LetterSlot->SetHorizontalAlignment(HAlign_Center);
		LetterSlot->SetVerticalAlignment(VAlign_Center);
		UOverlaySlot* CountSlot = Stack->AddChildToOverlay(Builder.Text(TEXT("CountText"), FText::GetEmpty(), Style.KeySize, true));
		CountSlot->SetHorizontalAlignment(HAlign_Right);
		CountSlot->SetVerticalAlignment(VAlign_Bottom);
		return Builder.Save() ? Builder.GeneratedClass() : nullptr;
	}

	/** 버튼들을 Columns 열의 고른 칸에 차례로 둔다(이름은 Prefix와 번호, 라벨은 코드가 채움). */
	UUniformGridPanel* ButtonGrid(FWidgetBlueprintBuilder& Builder, const TCHAR* Name, const TCHAR* Prefix, int32 Count, int32 Columns)
	{
		UUniformGridPanel* Grid = Builder.Add<UUniformGridPanel>(Name);
		Grid->SetSlotPadding(FMargin(Style.Gap * 0.5f));
		for (int32 Index = 0; Index < Count; ++Index)
		{
			UUniformGridSlot* Slot = Grid->AddChildToUniformGrid(Builder.Button(*FString::Printf(TEXT("%s%d"), Prefix, Index), FText::GetEmpty()), Index / Columns, Index % Columns);
			Slot->SetHorizontalAlignment(HAlign_Fill);
			Slot->SetVerticalAlignment(VAlign_Fill);
		}
		return Grid;
	}

	/** 퀵슬롯의 자리를 고르는 줄(36): 자리 8개를 4칸씩 두 줄로(좁은 창에도 들어가게). 스킬 창과 아이템 상세 창이 넣어 쓴다. */
	UClass* CreateQuickslotBar()
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::QuickslotBar, UMmoQuickslotBarWidget::StaticClass());
		Builder.SetRoot(ButtonGrid(Builder, TEXT("Grid"), TEXT("Slot"), UMmoHudWidget::QuickslotCount(), 4));
		return Builder.Save() ? Builder.GeneratedClass() : nullptr;
	}

	/** 스킬 창(36): 제목, 직업의 스킬 버튼(3열), 고른 스킬의 설명, 안내 글, 퀵슬롯의 줄, 비우기·닫기. */
	bool CreateSkills(UClass* QuickslotBarClass)
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::Skills, UMmoSkillsWidget::StaticClass());
		UVerticalBox* Column = Builder.Window(Style.WindowWide, Style.Dim);
		AddWithGap(*Column, Builder.KeyText(TEXT("Title"), TEXT("skills.title"), Style.TitleSize), Style.Section);
		AddWithGap(*Column, ButtonGrid(Builder, TEXT("SkillGrid"), TEXT("Skill"), UMmoSkillsWidget::MaxSkills, 3), Style.Section);
		UTextBlock* Detail = Builder.Text(TEXT("DetailText"), FText::GetEmpty(), Style.BodySize, true);
		Detail->SetAutoWrapText(true);
		AddWithGap(*Column, Detail, Style.Section);
		AddWithGap(*Column, Builder.Text(TEXT("HintText"), FText::GetEmpty(), Style.SmallSize + 2, true));
		AddWithGap(*Column, Builder.Add<UMmoQuickslotBarWidget>(QuickslotBarClass, TEXT("SlotBar"), true), Style.Section);
		ButtonsAtEnd(*Column, Row(Builder, TEXT("Buttons"), {
			Builder.Button(TEXT("ClearButton"), TEXT("skills.clear")), Builder.Button(TEXT("CloseButton"), TEXT("common.close")) }));
		return Builder.Save();
	}

	/** 강화 창(35): 제목, 대상 장비의 목록 위젯, 글(주문서 수, 다음 단계와 확률, 위험), 결과, 강화하기·닫기. */
	bool CreateEnchant(UClass* ItemSlotClass)
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::Enchant, UMmoEnchantWidget::StaticClass());
		UVerticalBox* Column = Builder.Window(Style.ItemSlot * 6 + Style.Gap * 2, Style.Dim);
		AddWithGap(*Column, Builder.KeyText(TEXT("Title"), TEXT("enchant.title"), Style.TitleSize), Style.Section);
		UTileView* Targets = Builder.Add<UTileView>(TEXT("Targets"), true);
		Targets->SetEntryWidth(Style.ItemSlot);
		Targets->SetEntryHeight(Style.ItemSlot);
		FindFProperty<FClassProperty>(UListViewBase::StaticClass(), TEXT("EntryWidgetClass"))->SetObjectPropertyValue_InContainer(Targets, ItemSlotClass);
		USizeBox* TargetSize = Builder.Add<USizeBox>(TEXT("TargetSize"));
		TargetSize->SetHeightOverride(Style.ItemSlot * 2);
		TargetSize->SetContent(Targets);
		AddWithGap(*Column, TargetSize);
		AddWithGap(*Column, Builder.Text(TEXT("InfoText"), FText::GetEmpty(), Style.BodySize, true));
		AddWithGap(*Column, Builder.Text(TEXT("ResultText"), FText::GetEmpty(), Style.BodySize, true, Style.Positive), Style.Section);
		AddWithGap(*Column, Builder.Button(TEXT("GoButton"), TEXT("enchant.go")));
		Column->AddChildToVerticalBox(Builder.Button(TEXT("CloseButton"), TEXT("common.close")));
		return Builder.Save();
	}

	/** 상점 창(37): 제목, 사기 목록(한 줄 6칸), 팔 내 인벤토리(보이는 줄만), 고른 것의 이름과 값, 골드, 사기·팔기와 닫기. */
	bool CreateShop(UClass* ItemSlotClass)
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::Shop, UMmoShopWidget::StaticClass());
		UVerticalBox* Column = Builder.Window(Style.ItemSlot * 6 + Style.Gap * 2, Style.Dim);
		AddWithGap(*Column, Builder.KeyText(TEXT("Title"), TEXT("shop.title"), Style.TitleSize), Style.Section);
		const auto Grid = [&](const TCHAR* Name, const TCHAR* TitleName, const TCHAR* TitleKey, int32 Rows)
		{
			AddWithGap(*Column, Builder.KeyText(TitleName, TitleKey, Style.SmallSize + 2));
			UTileView* Tiles = Builder.Add<UTileView>(Name, true);
			Tiles->SetEntryWidth(Style.ItemSlot);
			Tiles->SetEntryHeight(Style.ItemSlot);
			FindFProperty<FClassProperty>(UListViewBase::StaticClass(), TEXT("EntryWidgetClass"))->SetObjectPropertyValue_InContainer(Tiles, ItemSlotClass);
			USizeBox* Size = Builder.Add<USizeBox>(*FString::Printf(TEXT("%sSize"), Name));
			Size->SetHeightOverride(Style.ItemSlot * Rows);
			Size->SetContent(Tiles);
			AddWithGap(*Column, Size, Style.Section);
		};
		Grid(TEXT("BuyGrid"), TEXT("BuyTitle"), TEXT("shop.buy"), 2);
		Grid(TEXT("SellGrid"), TEXT("SellTitle"), TEXT("shop.sell"), 3);
		AddWithGap(*Column, Builder.Text(TEXT("InfoText"), FText::GetEmpty(), Style.BodySize, true));
		AddWithGap(*Column, Builder.Text(TEXT("GoldText"), FText::GetEmpty(), Style.BodySize, true), Style.Section);
		ButtonsAtEnd(*Column, Row(Builder, TEXT("Buttons"), {
			Builder.Button(TEXT("ActButton"), TEXT("shop.buy")), Builder.Button(TEXT("CloseButton"), TEXT("common.close")) }));
		return Builder.Save();
	}

	/** 전체 지도(76): 제목, 지도 그림(점과 구역 이름의 캔버스, 내 화살표를 겹침), 닫기. */
	bool CreateMap()
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::Map, UMmoMapWidget::StaticClass());
		UVerticalBox* Column = Builder.Window(UMmoMapWidget::MapSize + Style.PanelPadding * 2, Style.Dim);
		AddWithGap(*Column, Builder.KeyText(TEXT("Title"), TEXT("menu.map"), Style.TitleSize), Style.Gap);
		USizeBox* Size = Builder.Add<USizeBox>(TEXT("MapSize"));
		Size->SetWidthOverride(UMmoMapWidget::MapSize);
		Size->SetHeightOverride(UMmoMapWidget::MapSize);
		UOverlay* Stack = Builder.Add<UOverlay>(TEXT("MapStack"));
		Size->SetContent(Stack);
		UOverlaySlot* ImageSlot = Stack->AddChildToOverlay(Builder.Add<UImage>(TEXT("MapImage"), true));
		ImageSlot->SetHorizontalAlignment(HAlign_Fill);
		ImageSlot->SetVerticalAlignment(VAlign_Fill);
		UCanvasPanel* Dots = Builder.Add<UCanvasPanel>(TEXT("MapDots"), true);
		Dots->SetVisibility(ESlateVisibility::HitTestInvisible);
		UOverlaySlot* DotsSlot = Stack->AddChildToOverlay(Dots);
		DotsSlot->SetHorizontalAlignment(HAlign_Fill);
		DotsSlot->SetVerticalAlignment(VAlign_Fill);
		UTextBlock* Arrow = Builder.Text(TEXT("SelfArrow"), FText::AsCultureInvariant(TEXT("▲")), Style.BodySize, true, Style.Cast);
		Arrow->SetRenderTransformPivot(FVector2D(0.5, 0.5));
		UCanvasPanelSlot* ArrowSlot = Dots->AddChildToCanvas(Arrow);
		ArrowSlot->SetAutoSize(true);
		ArrowSlot->SetAlignment(FVector2D(0.5, 0.5));
		AddWithGap(*Column, Size, Style.Section);
		ButtonsAtEnd(*Column, Row(Builder, TEXT("Buttons"), { Builder.Button(TEXT("CloseButton"), TEXT("common.close")) }));
		return Builder.Save();
	}

	/** 창고 창(75): 제목, 안내 글, 창고 칸(왼쪽)과 내 가방 칸(오른쪽)을 나란히(보이는 줄만 만드는 목록 위젯, 한 줄 5칸), 닫기. */
	bool CreateStorage(UClass* ItemSlotClass)
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::Storage, UMmoStorageWidget::StaticClass());
		UVerticalBox* Column = Builder.Window(Style.ItemSlot * 10 + Style.Gap * 6 + Style.PanelPadding * 2, Style.Dim);
		AddWithGap(*Column, Builder.KeyText(TEXT("Title"), TEXT("storage.title"), Style.TitleSize), Style.Gap);
		UTextBlock* Hint = Builder.KeyText(TEXT("HintText"), TEXT("storage.hint"), Style.SmallSize + 2);
		Hint->SetAutoWrapText(true);
		AddWithGap(*Column, Hint, Style.Section);
		const auto Side = [&](const TCHAR* Name, const TCHAR* TitleKey)
		{
			UVerticalBox* Box = Builder.Add<UVerticalBox>(*FString::Printf(TEXT("%sBox"), Name));
			AddWithGap(*Box, Builder.KeyText(*FString::Printf(TEXT("%sTitle"), Name), TitleKey, Style.SmallSize + 2));
			UTileView* Tiles = Builder.Add<UTileView>(Name, true);
			Tiles->SetEntryWidth(Style.ItemSlot);
			Tiles->SetEntryHeight(Style.ItemSlot);
			FindFProperty<FClassProperty>(UListViewBase::StaticClass(), TEXT("EntryWidgetClass"))->SetObjectPropertyValue_InContainer(Tiles, ItemSlotClass);
			USizeBox* Size = Builder.Add<USizeBox>(*FString::Printf(TEXT("%sSize"), Name));
			Size->SetWidthOverride(Style.ItemSlot * 5 + Style.Gap * 2);
			Size->SetHeightOverride(Style.ItemSlot * 5);
			Size->SetContent(Tiles);
			Box->AddChildToVerticalBox(Size);
			return Box;
		};
		AddWithGap(*Column, Row(Builder, TEXT("Sides"), { Side(TEXT("StorageGrid"), TEXT("storage.title")), Side(TEXT("BagGrid"), TEXT("storage.mine")) }), Style.Section);
		ButtonsAtEnd(*Column, Row(Builder, TEXT("Buttons"), { Builder.Button(TEXT("CloseButton"), TEXT("common.close")) }));
		return Builder.Save();
	}

	/** 인벤토리 창(32): 제목, 칸의 목록 위젯(한 줄에 6칸, 보이는 줄만 만듦), 골드, 닫기. */
	bool CreateInventory(UClass* ItemSlotClass)
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::Inventory, UMmoInventoryWidget::StaticClass());
		UVerticalBox* Column = Builder.Window(Style.ItemSlot * 6 + Style.Gap * 2, Style.Dim);
		AddWithGap(*Column, Builder.KeyText(TEXT("Title"), TEXT("inventory.title"), Style.TitleSize), Style.Section);
		// 입은 장비 여섯 칸(34): 무기, 투구, 갑옷, 장갑, 신발, 장신구.
		AddWithGap(*Column, Builder.KeyText(TEXT("EquipmentTitle"), TEXT("inventory.equipment"), Style.SmallSize + 2));
		UTileView* EquipGrid = Builder.Add<UTileView>(TEXT("EquipGrid"), true);
		EquipGrid->SetEntryWidth(Style.ItemSlot);
		EquipGrid->SetEntryHeight(Style.ItemSlot);
		FindFProperty<FClassProperty>(UListViewBase::StaticClass(), TEXT("EntryWidgetClass"))->SetObjectPropertyValue_InContainer(EquipGrid, ItemSlotClass);
		USizeBox* EquipSize = Builder.Add<USizeBox>(TEXT("EquipSize"));
		EquipSize->SetHeightOverride(Style.ItemSlot);
		EquipSize->SetContent(EquipGrid);
		AddWithGap(*Column, EquipSize, Style.Section);
		UTileView* Grid = Builder.Add<UTileView>(TEXT("Grid"), true);
		Grid->SetEntryWidth(Style.ItemSlot);
		Grid->SetEntryHeight(Style.ItemSlot);
		// 항목 위젯의 클래스는 보호된 속성이라 리플렉션으로 넣는다.
		FClassProperty* Entry = FindFProperty<FClassProperty>(UListViewBase::StaticClass(), TEXT("EntryWidgetClass"));
		Entry->SetObjectPropertyValue_InContainer(Grid, ItemSlotClass);
		USizeBox* GridSize = Builder.Add<USizeBox>(TEXT("GridSize"));
		GridSize->SetHeightOverride(Style.ItemSlot * 5);
		GridSize->SetContent(Grid);
		AddWithGap(*Column, GridSize);
		AddWithGap(*Column, Builder.Text(TEXT("GoldText"), FText::GetEmpty(), Style.BodySize, true));
		Column->AddChildToVerticalBox(Builder.Button(TEXT("CloseButton"), TEXT("common.close")));
		return Builder.Save();
	}

	/** 아이템 상세 창(32): 이름(등급의 색), 등급·필요 레벨·직업·파는 값, 설명, 쓰기·퀵슬롯의 줄(36)·떨어뜨리기(33)·닫기. 맞지 않는 것은 기반 클래스가 감춘다. */
	bool CreateItemDetail(UClass* QuickslotBarClass)
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::ItemDetail, UMmoItemDetailWidget::StaticClass());
		UVerticalBox* Column = Builder.Window(Style.WindowNarrow, Style.Dim);
		AddWithGap(*Column, Builder.Text(TEXT("NameText"), FText::GetEmpty(), Style.TitleSize, true), Style.Section);
		AddWithGap(*Column, Builder.Text(TEXT("InfoText"), FText::GetEmpty(), Style.SmallSize + 2, true));
		AddWithGap(*Column, Builder.Text(TEXT("StatsText"), FText::GetEmpty(), Style.BodySize, true));
		AddWithGap(*Column, Builder.Text(TEXT("WarnText"), FText::GetEmpty(), Style.SmallSize + 2, true, Style.Negative));
		UTextBlock* Desc = Builder.Text(TEXT("DescText"), FText::GetEmpty(), Style.BodySize, true);
		Desc->SetAutoWrapText(true);
		AddWithGap(*Column, Desc, Style.Section);
		AddWithGap(*Column, Builder.Button(TEXT("EquipButton"), TEXT("detail.equip")));
		AddWithGap(*Column, Builder.Button(TEXT("EnchantButton"), TEXT("detail.enchant")));
		AddWithGap(*Column, Builder.Button(TEXT("UseButton"), TEXT("detail.use")));
		AddWithGap(*Column, Builder.KeyText(TEXT("QuickslotTitle"), TEXT("detail.quickslot"), Style.SmallSize + 2, true));
		AddWithGap(*Column, Builder.Add<UMmoQuickslotBarWidget>(QuickslotBarClass, TEXT("SlotBar"), true));
		AddWithGap(*Column, Builder.Button(TEXT("DropButton"), TEXT("detail.drop")));
		Column->AddChildToVerticalBox(Builder.Button(TEXT("CloseButton"), TEXT("common.close")));
		return Builder.Save();
	}

	/** 캐릭터 창(31): 제목, 레벨, 경험치, 능력치 넷(여러 줄 글 하나), 닫기. 글은 기반 클래스가 채운다. */
	bool CreateCharacter()
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::Character, UMmoCharacterWidget::StaticClass());
		UVerticalBox* Column = Builder.Window(Style.WindowNarrow, Style.Dim);
		AddWithGap(*Column, Builder.KeyText(TEXT("Title"), TEXT("character.title"), Style.TitleSize), Style.Section);
		AddWithGap(*Column, Builder.Text(TEXT("LevelText"), FText::GetEmpty(), Style.BodySize, true));
		AddWithGap(*Column, Builder.Text(TEXT("ExpText"), FText::GetEmpty(), Style.BodySize, true));
		AddWithGap(*Column, Builder.Text(TEXT("StatsText"), FText::GetEmpty(), Style.BodySize, true), Style.Section);
		Column->AddChildToVerticalBox(Builder.Button(TEXT("CloseButton"), TEXT("common.close")));
		return Builder.Save();
	}

	bool CreateCharacterSelect()
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::CharacterSelect, UMmoCharacterSelectWidget::StaticClass());
		// 바탕은 반투명이라 뒤의 월드에 세운 고른 캐릭터(34)가 보인다.
		UVerticalBox* Column = Builder.Window(Style.WindowWide, Style.Dim);
		AddWithGap(*Column, Builder.KeyText(TEXT("Title"), TEXT("select.title"), Style.TitleSize), Style.Section);

		// 칸 4개(Constant의 캐릭터 수). 글은 기반 클래스가 SetLabel로 채운다.
		for (int32 Index = 0; Index < 4; ++Index)
		{
			AddWithGap(*Column, Builder.Button(*FString::Printf(TEXT("Slot%dButton"), Index), FText::GetEmpty()));
		}

		Column->AddChildToVerticalBox(Row(Builder, TEXT("Buttons"), {
			Builder.Button(TEXT("CreateButton"), TEXT("select.create")), Builder.Button(TEXT("StartButton"), TEXT("select.start")) }))
			->SetPadding(FMargin(0.0f, Style.Gap, 0.0f, Style.Gap));
		Cast<UVerticalBoxSlot>(Column->GetChildAt(Column->GetChildrenCount() - 1)->Slot)->SetHorizontalAlignment(HAlign_Right);
		UTextBlock* Status = Builder.Text(TEXT("StatusText"), FText::GetEmpty(), Style.SmallSize + 2, true);
		Status->SetAutoWrapText(true);
		Column->AddChildToVerticalBox(Status);
		return Builder.Save();
	}

	bool CreateCharacterCreate()
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::CharacterCreate, UMmoCharacterCreateWidget::StaticClass());
		UVerticalBox* Column = Builder.Window(Style.WindowNarrow, Style.Dim);
		AddWithGap(*Column, Builder.KeyText(TEXT("Title"), TEXT("create.title"), Style.TitleSize), Style.Section);
		UEditableTextBox* NameBox = Builder.Add<UEditableTextBox>(TEXT("NameBox"), true);
		NameBox->SetHintText(FText::FromString(TEXT("create.nameHint")));
		AddWithGap(*Column, NameBox, Style.Section);
		AddWithGap(*Column, Row(Builder, TEXT("Classes"), {
			Builder.Button(TEXT("KnightButton"), TEXT("class.knight")), Builder.Button(TEXT("MageButton"), TEXT("class.mage")) }), Style.Section);
		UHorizontalBox* Buttons = Row(Builder, TEXT("Buttons"), {
			Builder.Button(TEXT("CancelButton"), TEXT("common.cancel")), Builder.Button(TEXT("CreateButton"), TEXT("create.create")) });
		Column->AddChildToVerticalBox(Buttons)->SetPadding(FMargin(0.0f, 0.0f, 0.0f, Style.Gap));
		Cast<UVerticalBoxSlot>(Buttons->Slot)->SetHorizontalAlignment(HAlign_Right);
		UTextBlock* Status = Builder.Text(TEXT("StatusText"), FText::GetEmpty(), Style.SmallSize + 2, true);
		Status->SetAutoWrapText(true);
		Column->AddChildToVerticalBox(Status);
		return Builder.Save();
	}

	bool CreateConfirm()
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::Confirm, UMmoConfirmWidget::StaticClass());
		UVerticalBox* Column = Builder.Window(Style.WindowNarrow, Style.Dim);
		UTextBlock* Message = Builder.Text(TEXT("MessageText"), FText::GetEmpty(), Style.BodySize, true);
		Message->SetAutoWrapText(true);
		AddWithGap(*Column, Message, Style.Section);
		ButtonsAtEnd(*Column, Row(Builder, TEXT("Buttons"), {
			Builder.Button(TEXT("YesButton"), TEXT("common.yes")), Builder.Button(TEXT("NoButton"), TEXT("common.no")) }));
		return Builder.Save();
	}

	/** 파티 창(42): 제목, 파티가 없을 때의 글, 최대 인원만큼의 줄(이름과 내보내기 버튼), 떠나기·닫기. */
	bool CreateParty()
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::Party, UMmoPartyWidget::StaticClass());
		UVerticalBox* Column = Builder.Window(Style.WindowNarrow, Style.Dim);
		AddWithGap(*Column, Builder.KeyText(TEXT("Title"), TEXT("party.title"), Style.TitleSize), Style.Section);
		UMmoTextBlock* Empty = Builder.KeyText(TEXT("EmptyText"), TEXT("party.empty"), Style.BodySize, true);
		Empty->SetVisibility(ESlateVisibility::Collapsed);
		AddWithGap(*Column, Empty);
		for (int32 Index = 0; Index < UMmoPartyWidget::MaxMembers(); ++Index)
		{
			UHorizontalBox* Line = Builder.Add<UHorizontalBox>(*FString::Printf(TEXT("Member%dRow"), Index));
			Line->SetVisibility(ESlateVisibility::Collapsed);
			UHorizontalBoxSlot* NameSlot = Line->AddChildToHorizontalBox(Builder.Text(*FString::Printf(TEXT("Member%dText"), Index), FText::GetEmpty(), Style.BodySize));
			NameSlot->SetSize(FSlateChildSize(ESlateSizeRule::Fill));
			NameSlot->SetVerticalAlignment(VAlign_Center);
			Line->AddChildToHorizontalBox(Builder.Button(*FString::Printf(TEXT("Member%dKick"), Index), TEXT("party.kick")));
			AddWithGap(*Column, Line);
		}
		Column->AddChildToVerticalBox(Builder.Add<USizeBox>(TEXT("Spacer")))->SetPadding(FMargin(0.0f, Style.Section * 0.5f, 0.0f, 0.0f));
		ButtonsAtEnd(*Column, Row(Builder, TEXT("Buttons"), { Builder.Button(TEXT("LeaveButton"), TEXT("party.leave")), Builder.Button(TEXT("CloseButton"), TEXT("common.close")) }));
		return Builder.Save();
	}

	/** 수량 입력: 제목, 고른 수, −10·−1·+1·+10·최대, 취소·확인. */
	bool CreateQuantity()
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::Quantity, UMmoQuantityWidget::StaticClass());
		UVerticalBox* Column = Builder.Window(Style.WindowWide, Style.Dim);
		AddWithGap(*Column, Builder.Text(TEXT("TitleText"), FText::GetEmpty(), Style.TitleSize, true), Style.Section);
		UTextBlock* Value = Builder.Text(TEXT("ValueText"), FText::GetEmpty(), Style.ValueSize, true);
		AddWithGap(*Column, Value, Style.Section);
		Cast<UVerticalBoxSlot>(Value->Slot)->SetHorizontalAlignment(HAlign_Center);
		UHorizontalBox* Steps = Row(Builder, TEXT("Steps"), {
			Builder.Button(TEXT("MinusTenButton"), FText::AsCultureInvariant(TEXT("−10"))), Builder.Button(TEXT("MinusOneButton"), FText::AsCultureInvariant(TEXT("−1"))),
			Builder.Button(TEXT("PlusOneButton"), FText::AsCultureInvariant(TEXT("+1"))), Builder.Button(TEXT("PlusTenButton"), FText::AsCultureInvariant(TEXT("+10"))),
			Builder.Button(TEXT("MaxButton"), TEXT("common.max")) });
		AddWithGap(*Column, Steps, Style.Section);
		Cast<UVerticalBoxSlot>(Steps->Slot)->SetHorizontalAlignment(HAlign_Center);
		ButtonsAtEnd(*Column, Row(Builder, TEXT("Buttons"), {
			Builder.Button(TEXT("CancelButton"), TEXT("common.cancel")), Builder.Button(TEXT("OkButton"), TEXT("common.ok")) }));
		return Builder.Save();
	}
}

UMmoCreateWidgetsCommandlet::UMmoCreateWidgetsCommandlet()
{
	IsClient = false;
	IsEditor = true;
	IsServer = false;
	LogToConsole = true;
}

namespace
{
	/** 아이콘 표(73). 지금은 줄이 없어 모두 글자 아이콘이고, 그림이 생기면(91) 여기에 줄을 더한다. */
	bool CreateIcons()
	{
		const FString PackageName = FPackageName::ObjectPathToPackageName(FString(UMmoIcons::Path));
		const FString Filename = FPackageName::LongPackageNameToFilename(PackageName, FPackageName::GetAssetPackageExtension());
		IFileManager::Get().Delete(*Filename, false, true, true);
		UPackage* Package = CreatePackage(*PackageName);
		UMmoIcons* Icons = NewObject<UMmoIcons>(Package, *FPackageName::GetShortName(PackageName), RF_Public | RF_Standalone);
		FAssetRegistryModule::AssetCreated(Icons);
		FSavePackageArgs Args;
		Args.TopLevelFlags = RF_Public | RF_Standalone;
		if (!UPackage::SavePackage(Package, Icons, *Filename, Args))
		{
			UE_LOG(LogMmoCreateWidgets, Error, TEXT("Could not save %s."), *Filename);
			return false;
		}
		return true;
	}
}

int32 UMmoCreateWidgetsCommandlet::Main(const FString& Params)
{
	FWidgetBlueprintBuilder::ButtonClass = CreateButton();
	UClass* Joystick = CreateJoystick();
	UClass* ItemSlot = CreateItemSlot();
	UClass* QuickslotBar = CreateQuickslotBar();
	UClass* Chat = CreateChat();
	const bool bOk = FWidgetBlueprintBuilder::ButtonClass && Joystick && ItemSlot && QuickslotBar && Chat && CreateLogin() && CreateCharacterSelect() && CreateCharacterCreate()
		&& CreateHud(Joystick, Chat) && CreateNotice() && CreateNameTag() && CreateSettings() && CreateCharacter() && CreateInventory(ItemSlot) && CreateEnchant(ItemSlot) && CreateSkills(QuickslotBar) && CreateShop(ItemSlot) && CreateStorage(ItemSlot) && CreateMap() && CreateParty() && CreateItemDetail(QuickslotBar) && CreateConfirm() && CreateQuantity() && CreateDeath() && CreateIcons();
	return bOk ? 0 : 1;
}

