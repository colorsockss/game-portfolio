#include "World/DevCommand.h"

namespace MmoWorld
{
	portfolio::mmo::Packet DevCommandPacket(const std::string& Line)
	{
		const size_t First = Line.find_first_not_of(" \t");
		const size_t Last = Line.find_last_not_of(" \t");
		portfolio::mmo::Packet Packet;
		Packet.mutable_dev_command()->set_line(First == std::string::npos ? std::string() : Line.substr(First, Last - First + 1));
		return Packet;
	}
}
