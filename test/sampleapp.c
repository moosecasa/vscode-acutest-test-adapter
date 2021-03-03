
#include "acutest.h"
#include "anotherfile.h"

static void
helper(void)
{
    /* Kill the current test with a condition which is never true. */
    TEST_ASSERT(1 == 2);

    /* This never happens because the test is aborted above. */
    TEST_CHECK(1 + 2 == 2 + 1);
}

void
test_abort(void)
{
    helper();

    /* This test never happens because the test is aborted inside the helper()
     * function. */
    TEST_CHECK(1 * 2 == 2 * 1);
}

void
test_crash(void)
{
    int* invalid = ((int*)NULL) + 0xdeadbeef;

    *invalid = 42;
    TEST_CHECK_(1 == 1, "This should never execute, due to a write into "
                        "an invalid address.");
}

TEST_LIST = {
    { "tutorial", test_tutorial },
    { "fail",     test_fail },
    { "abort",    test_abort },
    { "crash",    test_crash },
    { NULL, NULL }
};
