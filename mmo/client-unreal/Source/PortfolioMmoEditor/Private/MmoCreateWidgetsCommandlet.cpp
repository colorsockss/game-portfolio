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
#include "Components/OverlaySlot.h"
#include "Components/SafeZone.h"
#include "Components/SafeZoneSlot.h"
#include "Components/SizeBox.h"
#include "Components/TextBlock.h"
#include "Components/VerticalBox.h"
#include "Components/VerticalBoxSlot.h"
#include "Engine/Texture2D.h"
#include "HAL/FileManager.h"
#include "Kismet2/KismetEditorUtilities.h"
#include "UI/MmoButtonWidget.h"
#include "UI/MmoCharacterCreateWidget.h"
#include "UI/MmoCharacterSelectWidget.h"
#include "UI/MmoConfirmWidget.h"
#include "UI/MmoHudWidget.h"
#include "UI/MmoJoystickWidget.h"
#include "UI/MmoLoginWidget.h"
#include "UI/MmoNameTagWidget.h"
#include "UI/MmoNoticeWidget.h"
#include "UI/MmoQuantityWidget.h"
#include "UI/MmoSettingsWidget.h"
#include "UI/MmoUiPaths.h"
#include "UObject/SavePackage.h"
#include "WidgetBlueprint.h"

#define LOCTEXT_NAMESPACE "MmoUi"

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
		FLinearColor BarBack{ 0.0f, 0.0f, 0.0f, 0.6f };
		/** 고른 버튼(캐릭터 칸, 직업)의 배경 곱. */
		FLinearColor Selected{ 1.0f, 0.78f, 0.3f, 1.0f };

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
		/** HUD의 요소가 화면 모서리(안전 영역 안)에서 떨어지는 거리. */
		float HudMargin = 24.0f;
		float JoystickSize = 240.0f;
		/** HUD의 체력·마나 바 크기. */
		float BarWidth = 320.0f;
		float BarHeight = 24.0f;
		float NoticeTop = 80.0f;
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

		/** 스타일 표의 글자색과 그림자로 글을 만든다. */
		UTextBlock* Text(const TCHAR* Name, const FText& Value, int32 Size, bool bBound = false, const FLinearColor& Color = Style.Text)
		{
			UTextBlock* Block = Add<UTextBlock>(Name, bBound);
			Block->SetText(Value);
			FSlateFontInfo Font = Block->GetFont();
			Font.Size = Size;
			Block->SetFont(Font);
			Block->SetColorAndOpacity(FSlateColor(Color));
			Block->SetShadowOffset(FVector2D(1.0, 1.0));
			Block->SetShadowColorAndOpacity(Style.Shadow);
			return Block;
		}

		/** 공용 버튼(WBP_Button)을 놓는다. 이름이 기반 클래스의 BindWidget과 같아야 한다. */
		UMmoButtonWidget* Button(const TCHAR* Name, const FText& Label, bool bTouchOnly = false)
		{
			UMmoButtonWidget* Result = Add<UMmoButtonWidget>(ButtonClass, Name, true);
			Result->Label = Label;
			Result->bTouchOnly = bTouchOnly;
			Result->MinHeightTouch = Style.ButtonHeightTouch;
			Result->MinHeightPointer = Style.ButtonHeightPointer;
			Result->SelectedTint = Style.Selected;
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
	};

	/**
	 * HUD의 요소를 가까운 모서리에 붙인다(앵커와 정렬을 그 모서리로). Offset은 모서리에서 안쪽으로의 거리다(스타일 표의 HudMargin부터).
	 * 화면의 비율이 16:9에서 21:9로 넓어져도 요소는 모서리를 따라간다.
	 */
	UCanvasPanelSlot* Corner(UCanvasPanel& Canvas, UWidget* Widget, ECorner Where, FVector2D Offset = FVector2D(Style.HudMargin, Style.HudMargin))
	{
		const bool bRight = Where == ECorner::TopRight || Where == ECorner::BottomRight;
		const bool bBottom = Where == ECorner::BottomLeft || Where == ECorner::BottomRight;
		UCanvasPanelSlot* Slot = Canvas.AddChildToCanvas(Widget);
		Slot->SetAnchors(FAnchors(bRight ? 1.0f : 0.0f, bBottom ? 1.0f : 0.0f));
		Slot->SetAlignment(FVector2D(bRight ? 1.0 : 0.0, bBottom ? 1.0 : 0.0));
		Slot->SetPosition(FVector2D(bRight ? -Offset.X : Offset.X, bBottom ? -Offset.Y : Offset.Y));
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

		// 글은 가운데, 키 표시는 오른쪽 위 구석.
		UOverlay* Stack = Builder.Add<UOverlay>(TEXT("Stack"));
		UButtonSlot* StackSlot = Cast<UButtonSlot>(Button->AddChild(Stack));
		StackSlot->SetPadding(Style.ButtonPadding);
		StackSlot->SetHorizontalAlignment(HAlign_Fill);
		StackSlot->SetVerticalAlignment(VAlign_Fill);
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
		AddWithGap(*Column, Builder.Text(TEXT("Title"), LOCTEXT("Title", "PortfolioMmo"), Style.TitleSize + 4), Style.Section);
		UEditableTextBox* LoginIdBox = Builder.Add<UEditableTextBox>(TEXT("LoginIdBox"), true);
		LoginIdBox->SetHintText(LOCTEXT("LoginIdHint", "아이디 (영문 소문자·숫자·_ 4–16자)"));
		AddWithGap(*Column, LoginIdBox);
		AddWithGap(*Column, Builder.Button(TEXT("LogInButton"), LOCTEXT("LogIn", "로그인")));
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

	/** 체력·마나 바 하나: 둥근 바탕 위의 채움(<Name>Bar)과 가운데의 "지금 / 최대"(<Name>Text). 값은 UMmoHudWidget이 넣는다. */
	UWidget* Bar(FWidgetBlueprintBuilder& Builder, const TCHAR* Name, const FLinearColor& Fill)
	{
		USizeBox* Size = Builder.Add<USizeBox>(*FString::Printf(TEXT("%sBarSize"), Name));
		Size->SetWidthOverride(Style.BarWidth);
		Size->SetHeightOverride(Style.BarHeight);
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

		UTextBlock* Value = Builder.Text(*FString::Printf(TEXT("%sText"), Name), FText::GetEmpty(), Style.SmallSize, true);
		UOverlaySlot* ValueSlot = Stack->AddChildToOverlay(Value);
		ValueSlot->SetHorizontalAlignment(HAlign_Center);
		ValueSlot->SetVerticalAlignment(VAlign_Center);
		return Size;
	}

	bool CreateHud(UClass* JoystickClass)
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::Hud, UMmoHudWidget::StaticClass());
		UCanvasPanel* Root = Builder.SafeCanvas();

		// 조이스틱은 왼쪽 아래(터치 기기에서만 보임. UMmoHudWidget).
		Corner(*Root, Builder.Add<UUserWidget>(JoystickClass, TEXT("Joystick"), true), ECorner::BottomLeft,
			FVector2D(Style.HudMargin * 2.5, Style.HudMargin * 2.5));

		// 왼쪽 위에 내 체력·마나 바, 그 아래 지금 구역(이름과 권장 레벨)과 안전 지대 표시.
		UVerticalBox* Zone = Builder.Add<UVerticalBox>(TEXT("Zone"));
		Zone->SetVisibility(ESlateVisibility::HitTestInvisible);
		Corner(*Root, Zone, ECorner::TopLeft);
		Zone->AddChildToVerticalBox(Bar(Builder, TEXT("Hp"), Style.Hp));
		Zone->AddChildToVerticalBox(Bar(Builder, TEXT("Mp"), Style.Mp))->SetPadding(FMargin(0.0f, Style.Gap * 0.5f, 0.0f, Style.Gap));
		Zone->AddChildToVerticalBox(Builder.Text(TEXT("ZoneText"), FText::GetEmpty(), Style.BodySize, true));
		UTextBlock* SafeZoneText = Builder.Text(TEXT("SafeZoneText"), LOCTEXT("SafeZone", "안전 지대"), Style.SmallSize, true, Style.Positive);
		SafeZoneText->SetVisibility(ESlateVisibility::Collapsed);
		Zone->AddChildToVerticalBox(SafeZoneText);
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
		FWidgetBlueprintBuilder Builder(MmoUiPaths::NameTag, UMmoNameTagWidget::StaticClass());
		UTextBlock* Name = Builder.Text(TEXT("NameText"), FText::GetEmpty(), Style.SmallSize, true);
		Name->SetVisibility(ESlateVisibility::HitTestInvisible);
		Builder.SetRoot(Name);
		return Builder.Save();
	}

	bool CreateSettings()
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::Settings, UMmoSettingsWidget::StaticClass());
		UVerticalBox* Column = Builder.Window(Style.WindowNarrow, Style.Dim);
		AddWithGap(*Column, Builder.Text(TEXT("Title"), LOCTEXT("SettingsTitle", "설정"), Style.TitleSize), Style.Section);
		AddWithGap(*Column, Builder.Button(TEXT("CharacterSelectButton"), LOCTEXT("CharacterSelect", "캐릭터 선택")));
		AddWithGap(*Column, Builder.Button(TEXT("LogOutButton"), LOCTEXT("LogOut", "로그아웃")));
		Column->AddChildToVerticalBox(Builder.Button(TEXT("CloseButton"), LOCTEXT("Close", "닫기")));
		return Builder.Save();
	}

	bool CreateCharacterSelect()
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::CharacterSelect, UMmoCharacterSelectWidget::StaticClass());
		UVerticalBox* Column = Builder.Window(Style.WindowWide, Style.Backdrop);
		AddWithGap(*Column, Builder.Text(TEXT("Title"), LOCTEXT("CharacterSelectTitle", "캐릭터 선택"), Style.TitleSize), Style.Section);

		// 칸 4개(Constant의 캐릭터 수). 글은 기반 클래스가 SetLabel로 채운다.
		for (int32 Index = 0; Index < 4; ++Index)
		{
			AddWithGap(*Column, Builder.Button(*FString::Printf(TEXT("Slot%dButton"), Index), FText::GetEmpty()));
		}

		Column->AddChildToVerticalBox(Row(Builder, TEXT("Buttons"), {
			Builder.Button(TEXT("CreateButton"), LOCTEXT("Create", "만들기")), Builder.Button(TEXT("StartButton"), LOCTEXT("Start", "시작")) }))
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
		AddWithGap(*Column, Builder.Text(TEXT("Title"), LOCTEXT("CharacterCreateTitle", "캐릭터 만들기"), Style.TitleSize), Style.Section);
		UEditableTextBox* NameBox = Builder.Add<UEditableTextBox>(TEXT("NameBox"), true);
		NameBox->SetHintText(LOCTEXT("NameHint", "이름 (한글·영문·숫자 2–12자)"));
		AddWithGap(*Column, NameBox, Style.Section);
		AddWithGap(*Column, Row(Builder, TEXT("Classes"), {
			Builder.Button(TEXT("KnightButton"), LOCTEXT("Knight", "기사")), Builder.Button(TEXT("MageButton"), LOCTEXT("Mage", "마법사")) }), Style.Section);
		UHorizontalBox* Buttons = Row(Builder, TEXT("Buttons"), {
			Builder.Button(TEXT("CancelButton"), LOCTEXT("Cancel", "취소")), Builder.Button(TEXT("CreateButton"), LOCTEXT("Create", "만들기")) });
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
			Builder.Button(TEXT("YesButton"), LOCTEXT("Yes", "예")), Builder.Button(TEXT("NoButton"), LOCTEXT("No", "아니요")) }));
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
			Builder.Button(TEXT("MinusTenButton"), LOCTEXT("MinusTen", "−10")), Builder.Button(TEXT("MinusOneButton"), LOCTEXT("MinusOne", "−1")),
			Builder.Button(TEXT("PlusOneButton"), LOCTEXT("PlusOne", "+1")), Builder.Button(TEXT("PlusTenButton"), LOCTEXT("PlusTen", "+10")),
			Builder.Button(TEXT("MaxButton"), LOCTEXT("Max", "최대")) });
		AddWithGap(*Column, Steps, Style.Section);
		Cast<UVerticalBoxSlot>(Steps->Slot)->SetHorizontalAlignment(HAlign_Center);
		ButtonsAtEnd(*Column, Row(Builder, TEXT("Buttons"), {
			Builder.Button(TEXT("CancelButton"), LOCTEXT("Cancel", "취소")), Builder.Button(TEXT("OkButton"), LOCTEXT("Ok", "확인")) }));
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

int32 UMmoCreateWidgetsCommandlet::Main(const FString& Params)
{
	FWidgetBlueprintBuilder::ButtonClass = CreateButton();
	UClass* Joystick = CreateJoystick();
	const bool bOk = FWidgetBlueprintBuilder::ButtonClass && Joystick && CreateLogin() && CreateCharacterSelect() && CreateCharacterCreate()
		&& CreateHud(Joystick) && CreateNotice() && CreateNameTag() && CreateSettings() && CreateConfirm() && CreateQuantity();
	return bOk ? 0 : 1;
}

#undef LOCTEXT_NAMESPACE
