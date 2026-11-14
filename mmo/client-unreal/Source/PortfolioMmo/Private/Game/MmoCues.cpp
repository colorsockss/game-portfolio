#include "Game/MmoCues.h"

const FMmoCueRow* UMmoCues::Find(EMmoCue Cue, int32 Kind, int32 Key) const
{
	const FMmoCueRow* Fallback = nullptr;
	const FMmoCueRow* Default = nullptr;
	for (const FMmoCueRow& Row : Rows)
	{
		if (Row.Cue != Cue)
		{
			continue;
		}
		if (Row.Kind == Kind && Row.Key == Key)
		{
			return &Row;
		}
		Fallback = Row.Kind == Kind && Row.Key == 0 ? &Row : Fallback;
		Default = Row.Kind == 0 && Row.Key == 0 ? &Row : Default;
	}
	return Fallback ? Fallback : Default;
}
