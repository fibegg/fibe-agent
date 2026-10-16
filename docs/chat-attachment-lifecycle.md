# Chat upload and preview lifecycle

The composer admits at most five pending images and five pending attachments,
including requests in flight. Concurrent file, drop and paste batches share the
same admission budget. The existing image overflow behavior remains: when image
slots are full, a file may use an available attachment slot. Failed requests
release their reservation. Clearing the composer or changing conversation
invalidates pending completions so they cannot populate a later message.

The attachment hook releases only object URLs it created, after removal, clear,
conversation change or unmount. Saved messages use server filenames, not these
temporary previews. Removing a UI item does not authorize server upload deletion;
abandoned-upload retention remains separate from conversation history.

Optional runtime configuration uses the existing selected-Agent API URL helper,
including embedded path prefixes. An unavailable standalone configuration keeps
the optional fallback. Data export requires a successful HTTP response before
creating a download. Failed export and deletion requests display localized errors;
the existing deletion confirmation remains required.
