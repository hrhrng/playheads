/**
 * MessageList - displays chat messages
 */
export const MessageList = ({ messages, isLoading }) => {
  return (
    <div className="space-y-8 pb-12">
      {messages.map((msg, idx) => (
        <div
          key={idx}
          className={`flex flex-col w-full ${
            msg.role === 'user' ? 'items-end' : 'items-start'
          }`}
        >
          <span className="text-[10px] text-gray-500 mb-1 px-1 uppercase tracking-wider font-semibold">
            {msg.role === 'agent' ? 'DJ' : 'You'}
          </span>
          <div
            className={`text-2xl md:text-3xl font-medium leading-relaxed max-w-[90%] ${
              msg.role === 'user'
                ? 'text-gray-600 text-right italic'
                : 'text-gray-900'
            }`}
          >
            {msg.content}
          </div>
        </div>
      ))}

      {isLoading && (
        <div className="flex items-start">
          <span className="text-sm text-blue-600 font-medium animate-pulse tracking-widest">
            ON AIR...
          </span>
        </div>
      )}
    </div>
  );
};
