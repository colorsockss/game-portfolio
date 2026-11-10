#include "Game/MmoGameMode.h"

#include "Game/MmoPlayerController.h"

AMmoGameMode::AMmoGameMode()
{
	PlayerControllerClass = AMmoPlayerController::StaticClass();
	DefaultPawnClass = nullptr;
}
