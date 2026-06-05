import Foundation

/// Issues a request and exposes the response body as a stream of `Data` chunks,
/// so audio can begin playing before the full answer has downloaded. Used for
/// the framed-MP3 answer path (`POST /api/ask` with `X-Kivo-Stream: framed`),
/// where the server emits a sequence of length-prefixed MP3 segments.
///
/// `URLSession.data(for:)` buffers the entire response before returning, which
/// is exactly the latency we're removing — so this uses a data-task delegate to
/// surface each `didReceive data:` chunk as it arrives.
final class StreamingResponse: NSObject, URLSessionDataDelegate, @unchecked Sendable {
    private var continuation: AsyncThrowingStream<Data, Error>.Continuation?
    private var session: URLSession?
    private var failureStatus: Int?

    func stream(for request: URLRequest) -> AsyncThrowingStream<Data, Error> {
        AsyncThrowingStream { continuation in
            // Set before resuming the task: delegate callbacks can only fire after
            // `resume()`, so the continuation is always in place first.
            self.continuation = continuation
            let session = URLSession(configuration: .default, delegate: self, delegateQueue: nil)
            self.session = session
            let task = session.dataTask(with: request)
            continuation.onTermination = { @Sendable _ in
                task.cancel()
            }
            task.resume()
        }
    }

    func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive response: URLResponse,
        completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
    ) {
        if let http = response as? HTTPURLResponse {
            #if DEBUG
            let contentType = http.value(forHTTPHeaderField: "Content-Type") ?? "nil"
            print("[ARIA] audio │ ask response: status=\(http.statusCode) content-type=\(contentType)")
            #endif
            if !(200...299).contains(http.statusCode) {
                failureStatus = http.statusCode
            }
        }
        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard failureStatus == nil else { return }
        continuation?.yield(data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let failureStatus {
            continuation?.finish(
                throwing: APIClientError.server(
                    status: failureStatus,
                    message: "Request failed (\(failureStatus))"
                )
            )
        } else if let error {
            continuation?.finish(throwing: error)
        } else {
            continuation?.finish()
        }
        continuation = nil
        session.finishTasksAndInvalidate()
        self.session = nil
    }
}
