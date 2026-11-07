import { handleOperatorRequest } from './handler.ts';
import { liveDeps } from './live.ts';

export default {
  fetch(req: Request): Promise<Response> {
    return handleOperatorRequest(req, liveDeps());
  },
};
