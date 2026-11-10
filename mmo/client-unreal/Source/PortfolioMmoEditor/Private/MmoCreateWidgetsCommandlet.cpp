#include "MmoCreateWidgetsCommandlet.h"

#include "AssetRegistry/AssetRegistryModule.h"
#include "Blueprint/WidgetBlueprintGeneratedClass.h"
#include "Blueprint/WidgetTree.h"
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
#include "Components/OverlaySlot.h"
#include "Components/SizeBox.h"
#include "Components/TextBlock.h"
#include "Components/VerticalBox.h"
#include "Components/VerticalBoxSlot.h"
#include "Engine/Texture2D.h"
#include "HAL/FileManager.h"
#include "Kismet2/KismetEditorUtilities.h"
#include "UI/MmoConfirmWidget.h"
#include "UI/MmoHudWidget.h"
#include "UI/MmoJoystickWidget.h"
#include "UI/MmoLoginWidget.h"
#include "UI/MmoNameTagWidget.h"
#include "UI/MmoNoticeWidget.h"
#include "UI/MmoSettingsWidget.h"
#include "UI/MmoUiPaths.h"
#include "UObject/SavePackage.h"
#include "WidgetBlueprint.h"

#define LOCTEXT_NAMESPACE "MmoUi"

DEFINE_LOG_CATEGORY_STATIC(LogMmoCreateWidgets, Log, All);

namespace
{
	const FLinearColor Backdrop(0.02f, 0.02f, 0.03f, 1.0f);
	const FLinearColor Dim(0.0f, 0.0f, 0.0f, 0.5f);
	const FLinearColor PanelColor(0.06f, 0.07f, 0.09f, 0.96f);

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

		UTextBlock* Text(const TCHAR* Name, const FText& Value, int32 Size, bool bBound = false)
		{
			UTextBlock* Block = Add<UTextBlock>(Name, bBound);
			Block->SetText(Value);
			FSlateFontInfo Font = Block->GetFont();
			Font.Size = Size;
			Block->SetFont(Font);
			return Block;
		}

		UButton* Button(const TCHAR* Name, const FText& Label)
		{
			UButton* Result = Add<UButton>(Name, true);
			UTextBlock* Caption = Text(*FString::Printf(TEXT("%sLabel"), Name), Label, 18);
			Caption->SetColorAndOpacity(FSlateColor(FLinearColor(0.05f, 0.05f, 0.05f)));
			Cast<UButtonSlot>(Result->AddChild(Caption))->SetPadding(FMargin(16.0f, 6.0f));
			return Result;
		}

		/** 화면 전체를 어둡게 덮고 가운데에 폭 Width의 판을 놓는다(창과 팝업). 판 안의 세로 상자를 낸다. */
		UVerticalBox* CenteredPanel(float Width)
		{
			UBorder* Root = Add<UBorder>(TEXT("Dim"));
			Root->SetBrushColor(Dim);
			Root->SetHorizontalAlignment(HAlign_Center);
			Root->SetVerticalAlignment(VAlign_Center);
			Blueprint->WidgetTree->RootWidget = Root;

			USizeBox* Size = Add<USizeBox>(TEXT("PanelSize"));
			Size->SetWidthOverride(Width);
			Root->SetContent(Size);
			UBorder* Panel = Add<UBorder>(TEXT("Panel"));
			Panel->SetBrushColor(PanelColor);
			Panel->SetPadding(FMargin(24.0f));
			Size->SetContent(Panel);
			UVerticalBox* Column = Add<UVerticalBox>(TEXT("Column"));
			Panel->SetContent(Column);
			return Column;
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

	private:
		FString PackageName;
		FString Filename;
		UWidgetBlueprint* Blueprint = nullptr;
	};

	void AddWithPadding(UVerticalBox& Column, UWidget* Child, float Bottom)
	{
		Column.AddChildToVerticalBox(Child)->SetPadding(FMargin(0.0f, 0.0f, 0.0f, Bottom));
	}

	bool CreateLogin()
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::Login, UMmoLoginWidget::StaticClass());
		UBorder* Root = Builder.Add<UBorder>(TEXT("Root"));
		Root->SetBrushColor(Backdrop);
		Root->SetHorizontalAlignment(HAlign_Center);
		Root->SetVerticalAlignment(VAlign_Center);
		Builder.SetRoot(Root);

		USizeBox* Size = Builder.Add<USizeBox>(TEXT("PanelSize"));
		Size->SetWidthOverride(360.0f);
		Root->SetContent(Size);
		UVerticalBox* Column = Builder.Add<UVerticalBox>(TEXT("Column"));
		Size->SetContent(Column);

		AddWithPadding(*Column, Builder.Text(TEXT("Title"), LOCTEXT("Title", "PortfolioMmo"), 28), 16.0f);
		UEditableTextBox* LoginIdBox = Builder.Add<UEditableTextBox>(TEXT("LoginIdBox"), true);
		LoginIdBox->SetHintText(LOCTEXT("LoginIdHint", "아이디 (영문 소문자·숫자·_ 4–16자)"));
		AddWithPadding(*Column, LoginIdBox, 8.0f);
		AddWithPadding(*Column, Builder.Button(TEXT("LogInButton"), LOCTEXT("LogIn", "로그인")), 8.0f);
		UTextBlock* Status = Builder.Text(TEXT("StatusText"), FText::GetEmpty(), 16, true);
		Status->SetAutoWrapText(true);
		Column->AddChildToVerticalBox(Status);
		return Builder.Save();
	}

	/** 조이스틱을 만들고 그 클래스를 낸다(HUD가 담는다). 실패하면 nullptr. */
	UClass* CreateJoystick()
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::Joystick, UMmoJoystickWidget::StaticClass());
		USizeBox* Root = Builder.Add<USizeBox>(TEXT("Root"));
		Root->SetWidthOverride(240.0f);
		Root->SetHeightOverride(240.0f);
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
		Thumb->SetDesiredSizeOverride(FVector2D(100.0, 100.0));
		UOverlaySlot* ThumbSlot = Stack->AddChildToOverlay(Thumb);
		ThumbSlot->SetHorizontalAlignment(HAlign_Center);
		ThumbSlot->SetVerticalAlignment(VAlign_Center);
		return Builder.Save() ? Builder.GeneratedClass() : nullptr;
	}

	bool CreateHud(UClass* JoystickClass)
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::Hud, UMmoHudWidget::StaticClass());
		UCanvasPanel* Root = Builder.Add<UCanvasPanel>(TEXT("Root"));
		Root->SetVisibility(ESlateVisibility::SelfHitTestInvisible);
		Builder.SetRoot(Root);

		UUserWidget* Joystick = Builder.Add<UUserWidget>(JoystickClass, TEXT("Joystick"), true);
		UCanvasPanelSlot* Slot = Root->AddChildToCanvas(Joystick);
		Slot->SetAnchors(FAnchors(0.0f, 1.0f));
		Slot->SetAlignment(FVector2D(0.0, 1.0));
		Slot->SetPosition(FVector2D(60.0, -60.0));
		Slot->SetAutoSize(true);
		return Builder.Save();
	}

	bool CreateNotice()
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::Notice, UMmoNoticeWidget::StaticClass());
		UOverlay* Root = Builder.Add<UOverlay>(TEXT("Root"));
		Root->SetVisibility(ESlateVisibility::HitTestInvisible);
		Builder.SetRoot(Root);
		UBorder* Box = Builder.Add<UBorder>(TEXT("Box"));
		Box->SetBrushColor(FLinearColor(0.0f, 0.0f, 0.0f, 0.65f));
		Box->SetPadding(FMargin(16.0f, 8.0f));
		UOverlaySlot* Slot = Root->AddChildToOverlay(Box);
		Slot->SetHorizontalAlignment(HAlign_Center);
		Slot->SetVerticalAlignment(VAlign_Top);
		Slot->SetPadding(FMargin(0.0f, 80.0f, 0.0f, 0.0f));
		Box->SetContent(Builder.Text(TEXT("MessageText"), FText::GetEmpty(), 18, true));
		return Builder.Save();
	}

	bool CreateNameTag()
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::NameTag, UMmoNameTagWidget::StaticClass());
		UTextBlock* Name = Builder.Text(TEXT("NameText"), FText::GetEmpty(), 14, true);
		Name->SetShadowOffset(FVector2D(1.0, 1.0));
		Name->SetShadowColorAndOpacity(FLinearColor(0.0f, 0.0f, 0.0f, 0.8f));
		Name->SetVisibility(ESlateVisibility::HitTestInvisible);
		Builder.SetRoot(Name);
		return Builder.Save();
	}

	bool CreateSettings()
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::Settings, UMmoSettingsWidget::StaticClass());
		UVerticalBox* Column = Builder.CenteredPanel(320.0f);
		AddWithPadding(*Column, Builder.Text(TEXT("Title"), LOCTEXT("SettingsTitle", "설정"), 24), 16.0f);
		AddWithPadding(*Column, Builder.Button(TEXT("LogOutButton"), LOCTEXT("LogOut", "로그아웃")), 8.0f);
		Column->AddChildToVerticalBox(Builder.Button(TEXT("CloseButton"), LOCTEXT("Close", "닫기")));
		return Builder.Save();
	}

	bool CreateConfirm()
	{
		FWidgetBlueprintBuilder Builder(MmoUiPaths::Confirm, UMmoConfirmWidget::StaticClass());
		UVerticalBox* Column = Builder.CenteredPanel(320.0f);
		UTextBlock* Message = Builder.Text(TEXT("MessageText"), FText::GetEmpty(), 18, true);
		Message->SetAutoWrapText(true);
		AddWithPadding(*Column, Message, 16.0f);
		UHorizontalBox* Buttons = Builder.Add<UHorizontalBox>(TEXT("Buttons"));
		Buttons->AddChildToHorizontalBox(Builder.Button(TEXT("YesButton"), LOCTEXT("Yes", "예")))->SetPadding(FMargin(0.0f, 0.0f, 8.0f, 0.0f));
		Buttons->AddChildToHorizontalBox(Builder.Button(TEXT("NoButton"), LOCTEXT("No", "아니요")));
		Column->AddChildToVerticalBox(Buttons)->SetHorizontalAlignment(HAlign_Right);
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
	UClass* Joystick = CreateJoystick();
	const bool bOk = CreateLogin() && Joystick && CreateHud(Joystick) && CreateNotice() && CreateNameTag() && CreateSettings() && CreateConfirm();
	return bOk ? 0 : 1;
}

#undef LOCTEXT_NAMESPACE
